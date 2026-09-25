import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../../src/theme';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import EdgeSwipeBack from '../../components/EdgeSwipeBack';
import RecipeThumb from '../../components/meals/RecipeThumb';
import { useApp } from '../../src/context/AppContext';
import {
  MEAL_TYPES, RECIPE_CATEGORY_OPTIONS,
} from '../../src/data/norwegianRecipes';
import {
  createFamilyRecipe, updateFamilyRecipe, saveBuiltinRecipeAsCustom,
  importRecipeWithAi,
} from '../../src/utils/familyRecipes';
import { pickImage, uploadImage } from '../../src/utils/media';

function emptyIngredient() {
  return { name: '', amount: '' };
}

/** Alert.alert is often silent on mobile Safari — show a visible fallback on web. */
function notify(title, message) {
  const text = [title, message].filter(Boolean).join('\n');
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(text);
    return;
  }
  Alert.alert(title, message);
}

async function pickedToBase64(picked) {
  if (!picked) return '';
  let blob = picked.blob;
  if (!blob && picked.uri) {
    const res = await fetch(picked.uri);
    blob = await res.blob();
  }
  if (!blob) return '';
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Kunne ikke lese bildet'));
    reader.readAsDataURL(blob);
  });
}

export default function CreateRecipeScreen({ recipe, onBack, onSaved }) {
  const { familyId, uid, members, isParent } = useApp();
  const isBuiltin = !!recipe?.id && !recipe?.isCustom;
  const editingCustom = !!recipe?.id && !!recipe?.isCustom;
  const myName = members.find((m) => m.uid === uid)?.name || '';

  const [title, setTitle] = useState(recipe?.title || '');
  const [tag, setTag] = useState(recipe?.tag || 'Middag');
  const [category, setCategory] = useState(
    recipe?.category && recipe.category !== 'all'
      ? recipe.category
      : 'mine',
  );
  const [minutes, setMinutes] = useState(String(recipe?.minutes || 30));
  const [prepMinutes, setPrepMinutes] = useState(String(recipe?.prepMinutes || 0));
  const [portions, setPortions] = useState(String(recipe?.portions || 4));
  const [description, setDescription] = useState(recipe?.description || '');
  const [instructions, setInstructions] = useState(recipe?.instructions || '');
  const [sourceUrl, setSourceUrl] = useState(recipe?.sourceUrl || '');
  const [videoUrl, setVideoUrl] = useState(recipe?.videoUrl || '');
  const [ingredients, setIngredients] = useState(
    recipe?.ingredients?.length ? recipe.ingredients : [emptyIngredient(), emptyIngredient()],
  );
  const [imageUrl, setImageUrl] = useState(recipe?.imageUrl || '');
  const [coverImageUrl, setCoverImageUrl] = useState(recipe?.coverImageUrl || '');
  const [emoji, setEmoji] = useState(recipe?.emoji || '🍽️');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [importError, setImportError] = useState('');

  const updateIngredient = (index, field, value) => {
    setIngredients((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const addIngredientRow = () => {
    setIngredients((prev) => [...prev, emptyIngredient()]);
  };

  const removeIngredientRow = (index) => {
    setIngredients((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const applyImported = (imported) => {
    if (!imported) return;
    if (imported.title) setTitle(imported.title);
    if (imported.tag) setTag(imported.tag);
    if (imported.category) setCategory(imported.category === 'mine' ? 'rask' : imported.category);
    if (imported.minutes) setMinutes(String(imported.minutes));
    if (imported.prepMinutes != null) setPrepMinutes(String(imported.prepMinutes || 0));
    if (imported.portions) setPortions(String(imported.portions));
    if (imported.description) setDescription(imported.description);
    if (imported.instructions) setInstructions(imported.instructions);
    if (imported.sourceUrl) setSourceUrl(imported.sourceUrl);
    if (imported.videoUrl) setVideoUrl(imported.videoUrl);
    if (imported.emoji) setEmoji(imported.emoji);
    if (imported.suggestedImageUrl) {
      // External cover from recipe page — shown until user uploads their own photo.
      setCoverImageUrl(imported.suggestedImageUrl);
    }
    if (Array.isArray(imported.ingredients) && imported.ingredients.length) {
      setIngredients(imported.ingredients);
    }
  };

  const runAiImport = async ({ url, camera = false, library = false } = {}) => {
    if (!familyId || importing) return;
    if (!isParent) {
      notify('Kun foreldre', 'Kun foreldre kan importere oppskrifter.');
      return;
    }
    setImporting(true);
    setImportError('');
    setImportStatus(
      url
        ? 'Henter og tolker oppskriften fra lenken…'
        : 'Tolker oppskriften med AI…',
    );
    try {
      let imageBase64 = '';
      if (camera || library) {
        const picked = await pickImage({ camera: !!camera, edit: false });
        if (!picked) {
          setImporting(false);
          setImportStatus('');
          return;
        }
        imageBase64 = await pickedToBase64(picked);
        // Also set as recipe photo when possible
        try {
          setUploadingPhoto(true);
          const path = `families/${familyId}/recipes/${Date.now()}.jpg`;
          const urlUploaded = await uploadImage(path, picked);
          setImageUrl(urlUploaded);
          setCoverImageUrl('');
        } catch {
          /* cover kan komme fra AI */
        } finally {
          setUploadingPhoto(false);
        }
      }
      const data = await importRecipeWithAi(familyId, {
        sourceUrl: url || '',
        imageBase64,
      });
      if (!data?.recipe?.title) {
        throw new Error('Fant ingen oppskrift');
      }
      applyImported(data.recipe);
      if (url) setImportUrl(url);
      setImportStatus('Ferdig — sjekk feltene og lagre.');
      notify('Importert', 'Sjekk feltene og lagre når alt ser riktig ut.');
    } catch (err) {
      const code = err?.code || err?.customData?.status || '';
      const raw = err?.message || 'Klarte ikke tolke oppskriften.';
      const msg = /not-found|404/i.test(String(code) + raw)
        ? 'AI-import er ikke tilgjengelig i miljøet ennå. Prøv igjen om litt, eller fyll inn manuelt.'
        : raw;
      setImportError(msg);
      setImportStatus('');
      notify('Import feilet', msg);
    } finally {
      setImporting(false);
    }
  };

  const pickPhoto = async ({ camera = false } = {}) => {
    if (!familyId || uploadingPhoto) return;
    try {
      const picked = await pickImage({ edit: false, camera });
      if (!picked) return;
      setUploadingPhoto(true);
      const path = `families/${familyId}/recipes/${Date.now()}.jpg`;
      const url = await uploadImage(path, picked);
      setImageUrl(url);
      setCoverImageUrl('');
    } catch {
      Alert.alert('Feil', 'Klarte ikke laste opp bildet.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed || !familyId) return;
    if (!isParent) {
      Alert.alert('Kun foreldre', 'Kun foreldre kan opprette oppskrifter.');
      return;
    }
    const validIngredients = ingredients.filter((i) => i.name.trim());
    if (!validIngredients.length) {
      Alert.alert('Mangler ingredienser', 'Legg til minst én ingrediens.');
      return;
    }

    setSaving(true);
    try {
      const resolvedCategory = category === 'mine' || category === 'all' ? 'mine' : category;
      const payload = {
        title: trimmed,
        tag,
        category: editingCustom || isBuiltin ? resolvedCategory : resolvedCategory,
        minutes: Number(minutes) || 30,
        prepMinutes: Number(prepMinutes) || 0,
        cookMinutes: Number(minutes) || 30,
        portions: Number(portions) || 4,
        description: description.trim(),
        instructions: instructions.trim(),
        sourceUrl: sourceUrl.trim(),
        videoUrl: videoUrl.trim(),
        ingredients: validIngredients,
        imageUrl,
        coverImageUrl: imageUrl ? '' : coverImageUrl.trim(),
        emoji: emoji || '🍽️',
      };

      if (editingCustom) {
        await updateFamilyRecipe(familyId, recipe.id, payload);
        onSaved?.({ ...recipe, ...payload, isCustom: true });
      } else if (isBuiltin) {
        const extras = recipe.fromCatalog
          ? { sourceCatalogId: recipe.id }
          : { sourceBuiltinId: recipe.id };
        const ref = await saveBuiltinRecipeAsCustom(familyId, recipe, {
          ...payload,
          ...extras,
        }, {
          createdBy: uid,
          createdByName: myName,
        });
        onSaved?.({
          id: ref.id, ...recipe, ...payload, isCustom: true, ...extras,
        });
      } else {
        const ref = await createFamilyRecipe(familyId, {
          ...payload,
          createdBy: uid,
          createdByName: myName,
        });
        onSaved?.({ id: ref.id, ...payload, isCustom: true, emoji: payload.emoji });
      }
      onBack?.();
    } catch {
      Alert.alert('Feil', 'Klarte ikke lagre oppskriften.');
    } finally {
      setSaving(false);
    }
  };

  const previewRecipe = {
    title: title || 'Ny oppskrift',
    emoji: emoji || '🍽️',
    imageUrl,
    coverImageUrl,
    isCustom: true,
  };

  const categoryChoices = [
    { id: 'mine', label: 'Mine oppskrifter' },
    ...RECIPE_CATEGORY_OPTIONS,
  ];

  return (
    <Screen>
      <EdgeSwipeBack onBack={onBack}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <CompactBackLink onPress={onBack} label="Oppskrifter" />
          <Text style={styles.heading}>
            {editingCustom ? 'Rediger oppskrift' : isBuiltin ? 'Tilpass oppskrift' : 'Ny oppskrift'}
          </Text>
          {isBuiltin ? (
            <Text style={styles.builtinHint}>
              Endringer lagres som en kopi hos familien. Originalforslaget skjules.
            </Text>
          ) : null}

          {!(editingCustom || isBuiltin) ? (
            <View style={styles.importCard}>
              <Text style={styles.importTitle}>Importer med AI</Text>
              <Text style={styles.importHint}>
                Ta bilde, last opp bilde, eller lim inn lenke til en oppskrift — så fyller AI ut feltene.
              </Text>
              <View style={styles.importActions}>
                <TouchableOpacity
                  style={styles.importBtn}
                  onPress={() => runAiImport({ camera: true })}
                  disabled={importing}
                >
                  <Ionicons name="camera-outline" size={18} color={colors.brand} />
                  <Text style={styles.importBtnTxt}>Ta bilde</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.importBtn}
                  onPress={() => runAiImport({ library: true })}
                  disabled={importing}
                >
                  <Ionicons name="image-outline" size={18} color={colors.brand} />
                  <Text style={styles.importBtnTxt}>Last opp</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                value={importUrl}
                onChangeText={setImportUrl}
                placeholder="https://… (oppskrift / YouTube)"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.importLinkBtn, (!importUrl.trim() || importing) && styles.saveBtnDisabled]}
                onPress={() => runAiImport({ url: importUrl.trim() })}
                disabled={!importUrl.trim() || importing}
              >
                {importing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnTxt}>Tolke lenke med AI</Text>
                )}
              </TouchableOpacity>
              {importStatus ? (
                <Text style={styles.importStatus}>{importStatus}</Text>
              ) : null}
              {importError ? (
                <Text style={styles.importError}>{importError}</Text>
              ) : null}
            </View>
          ) : null}

          <TouchableOpacity style={styles.photoRow} onPress={() => pickPhoto({ camera: false })} disabled={uploadingPhoto}>
            <RecipeThumb recipe={previewRecipe} size={72} />
            <View style={{ flex: 1 }}>
              <Text style={styles.photoTitle}>
                {uploadingPhoto ? 'Laster opp…' : imageUrl || coverImageUrl ? 'Bytt bilde' : 'Legg til bilde'}
              </Text>
              <Text style={styles.photoHint}>
                {coverImageUrl && !imageUrl
                  ? 'Bilde fra oppskriftslenken — lagres når du lagrer'
                  : 'Valgfritt — vises i oppskriftslisten'}
              </Text>
            </View>
            {uploadingPhoto ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Ionicons name="camera-outline" size={22} color={colors.brand} />
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoAlt} onPress={() => pickPhoto({ camera: true })}>
            <Ionicons name="camera" size={16} color={colors.brand} />
            <Text style={styles.photoAltTxt}>Ta nytt bilde med kamera</Text>
          </TouchableOpacity>

          <Text style={styles.lbl}>Navn</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="F.eks. Mormors lapskaus"
            autoFocus={Platform.OS === 'web' && !importing}
          />

          <Text style={styles.lbl}>Måltid</Text>
          <View style={styles.tagRow}>
            {MEAL_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tagBtn, tag === t && styles.tagBtnOn]}
                onPress={() => setTag(t)}
              >
                <Text style={[styles.tagTxt, tag === t && styles.tagTxtOn]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.lbl}>Kategori</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            {categoryChoices.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.catBtn, category === c.id && styles.catBtnOn]}
                onPress={() => setCategory(c.id)}
              >
                <Text style={[styles.catTxt, category === c.id && styles.catTxtOn]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lbl}>Tid totalt (min)</Text>
              <TextInput
                style={styles.input}
                value={minutes}
                onChangeText={setMinutes}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.lbl}>Forberedelse</Text>
              <TextInput
                style={styles.input}
                value={prepMinutes}
                onChangeText={setPrepMinutes}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.lbl}>Porsjoner</Text>
              <TextInput
                style={styles.input}
                value={portions}
                onChangeText={setPortions}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <Text style={styles.lbl}>Beskrivelse</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Kort beskrivelse av retten"
            multiline
          />

          <Text style={styles.lbl}>Slik gjør du</Text>
          <TextInput
            style={[styles.input, styles.textAreaTall]}
            value={instructions}
            onChangeText={setInstructions}
            placeholder={'1. Sett ovnen på …\n2. Brun kjøttet …\n3. …'}
            multiline
          />

          <Text style={styles.lbl}>Lenke til oppskrift / nettside</Text>
          <TextInput
            style={styles.input}
            value={sourceUrl}
            onChangeText={setSourceUrl}
            placeholder="https://…"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.lbl}>Video (valgfritt)</Text>
          <TextInput
            style={styles.input}
            value={videoUrl}
            onChangeText={setVideoUrl}
            placeholder="YouTube eller annen video-URL"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.ingHeader}>
            <Text style={styles.lbl}>Ingredienser</Text>
            <TouchableOpacity onPress={addIngredientRow} hitSlop={8}>
              <Ionicons name="add-circle-outline" size={22} color={colors.brand} />
            </TouchableOpacity>
          </View>

          {ingredients.map((ing, i) => (
            <View key={`ing-${i}`} style={styles.ingRow}>
              <TextInput
                style={[styles.input, styles.ingName]}
                value={ing.name}
                onChangeText={(v) => updateIngredient(i, 'name', v)}
                placeholder="Ingrediens"
              />
              <TextInput
                style={[styles.input, styles.ingAmt]}
                value={ing.amount}
                onChangeText={(v) => updateIngredient(i, 'amount', v)}
                placeholder="Mengde"
              />
              <TouchableOpacity onPress={() => removeIngredientRow(i)} hitSlop={8}>
                <Ionicons name="close-circle-outline" size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.saveBtn, (!title.trim() || saving) && styles.saveBtnDisabled]}
            onPress={save}
            disabled={!title.trim() || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnTxt}>
                {editingCustom ? 'Lagre endringer' : isBuiltin ? 'Lagre kopi' : 'Lagre oppskrift'}
              </Text>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </EdgeSwipeBack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  heading: { fontSize: 24, fontWeight: '400', color: colors.ink, marginBottom: 8 },
  builtinHint: {
    fontSize: 13, color: colors.muted, fontWeight: '400', marginBottom: 16, lineHeight: 18,
  },
  importCard: {
    backgroundColor: '#eef6ff',
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dbeafe',
    marginBottom: 16,
  },
  importTitle: { fontWeight: '400', color: colors.ink, fontSize: 15, marginBottom: 4 },
  importHint: { fontSize: 12, color: colors.muted, fontWeight: '400', marginBottom: 10, lineHeight: 17 },
  importActions: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  importBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 10,
  },
  importBtnTxt: { fontWeight: '400', color: colors.brand, fontSize: 13 },
  importLinkBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  importStatus: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '400',
    color: colors.brand,
    lineHeight: 18,
  },
  importError: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '400',
    color: '#b91c1c',
    lineHeight: 18,
  },
  photoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.card, borderRadius: radius.lg, padding: 14,
    borderWidth: 1, borderColor: colors.line, marginBottom: 8,
  },
  photoTitle: { fontWeight: '400', color: colors.ink, fontSize: 15 },
  photoHint: { fontSize: 12, color: colors.muted, fontWeight: '400', marginTop: 2 },
  photoAlt: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, paddingLeft: 4,
  },
  photoAltTxt: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  lbl: { fontSize: 12, fontWeight: '400', color: colors.muted, marginBottom: 8, textTransform: 'uppercase' },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: colors.card, marginBottom: 14,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  textAreaTall: { minHeight: 140, textAlignVertical: 'top' },
  tagRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tagBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center',
  },
  tagBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tagTxt: { fontWeight: '400', color: colors.brand, fontSize: 13 },
  tagTxtOn: { color: '#fff' },
  catRow: { gap: 8, marginBottom: 14, paddingRight: 8 },
  catBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
  },
  catBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  catTxt: { fontWeight: '400', color: colors.ink, fontSize: 12 },
  catTxtOn: { color: '#fff' },
  row: { flexDirection: 'row', gap: 10 },
  ingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ingRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  ingName: { flex: 1, marginBottom: 0 },
  ingAmt: { width: 100, marginBottom: 0 },
  saveBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand, borderRadius: radius.md,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
});
