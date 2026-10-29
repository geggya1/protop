/**
 * Om oss: bedriftens egen artikkel. Blokker med tekst (Markdown med verktøylinje) og bilder
 * i full bredde eller ved siden av en tekst. Uten artikkel vises teksten fra forsiden.
 * Redigering skjer her når «Rediger side» er på; lagring går via hele siden.
 */
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLayout } from '../../src/theme';
import {
  ARTICLE_LIMITS, IMAGE_LAYOUTS, moveListItem, newArticleBlock,
} from '../../src/project/companyPage';
import { radius, space, type } from '../../src/ui/tokens';
import ArticleText from './ArticleText';
import ArticleTextField from './ArticleTextField';
import {
  Card, EditBar, EmptyNote, IconAction, PillButton,
} from './ProfileParts';
import { useCroppedUpload } from './useCroppedUpload';

const ARTICLE_ASPECTS = [
  { id: 'wide', label: 'Bred', value: 16 / 9 },
  { id: 'photo', label: 'Foto', value: 4 / 3 },
  { id: 'square', label: 'Kvadrat', value: 1 },
  { id: 'portrait', label: 'Stående', value: 3 / 4 },
];

/** Bildet i sitt eget format (leses fra filen), så stående og liggende bilder ikke beskjæres. */
function ArticleImage({ uri, caption, colors }) {
  const [ratio, setRatio] = useState(16 / 9);
  useEffect(() => {
    if (!uri) return undefined;
    let alive = true;
    Image.getSize(uri, (w, h) => {
      if (alive && w > 0 && h > 0) setRatio(Math.max(0.5, Math.min(3, w / h)));
    }, () => {});
    return () => { alive = false; };
  }, [uri]);
  return (
    <View style={styles.figure}>
      <Image
        source={{ uri }}
        style={[styles.image, { aspectRatio: ratio, backgroundColor: colors.sunken }]}
        resizeMode="cover"
        accessibilityLabel={caption || 'Bilde'}
      />
      {caption ? <Text style={[type.caption, { color: colors.muted }]}>{caption}</Text> : null}
    </View>
  );
}

function ArticleBlocks({ blocks, colors, stacked }) {
  return blocks.map((block) => {
    if (block.type === 'text') {
      return <ArticleText key={block.id} text={block.text} colors={colors} />;
    }
    if (!block.url) return null;
    if (block.layout === 'full' || !block.text) {
      return <ArticleImage key={block.id} uri={block.url} caption={block.caption} colors={colors} />;
    }
    const image = (
      <View style={stacked ? null : styles.sideImage}>
        <ArticleImage uri={block.url} caption={block.caption} colors={colors} />
      </View>
    );
    const copy = <View style={styles.sideText}><ArticleText text={block.text} colors={colors} /></View>;
    return (
      <View key={block.id} style={[styles.side, stacked && styles.sideStacked]}>
        {block.layout === 'right' && !stacked ? <>{copy}{image}</> : <>{image}{copy}</>}
      </View>
    );
  });
}

export default function CompanyArticle({
  article,
  fallback = '',
  editing,
  canEdit,
  colors,
  familyId,
  onEdit,
  onUpdate,
  saving,
  error,
  onSave,
  onCancel,
}) {
  const { isPhone } = useLayout();
  const blocks = Array.isArray(article?.blocks) ? article.blocks : [];
  const shown = blocks.filter((row) => (row.type === 'image' ? row.url : String(row.text || '').trim()));
  const images = useCroppedUpload({
    familyId,
    folder: 'companyPage',
    aspect: ARTICLE_ASPECTS[0].value,
    aspectPair: [16, 9],
    aspects: ARTICLE_ASPECTS,
    title: 'Beskjær bilde',
    maxEdge: 2000,
  });

  function update(fn) {
    onUpdate((prev) => ({ blocks: fn(Array.isArray(prev?.blocks) ? prev.blocks : []) }));
  }

  function patchBlock(id, partial) {
    update((list) => list.map((row) => (row.id === id ? { ...row, ...partial } : row)));
  }

  async function pickImage(id) {
    const url = await images.choose();
    if (url) patchBlock(id, { url });
  }

  function addBlock(kind, seed = '') {
    const block = newArticleBlock(kind);
    if (seed) block.text = seed;
    update((list) => [...list, block].slice(0, ARTICLE_LIMITS.blocks));
    // Filvelgeren på nett må åpnes direkte fra trykket.
    if (kind === 'image') pickImage(block.id);
  }

  if (!editing) {
    if (!shown.length) {
      return (
        <Card colors={colors} nativeID="company-article">
          {fallback ? (
            <View style={styles.column}><ArticleText text={fallback} colors={colors} /></View>
          ) : (
            <EmptyNote colors={colors}>Bedriften har ikke skrevet om seg selv ennå.</EmptyNote>
          )}
          {canEdit ? (
            <View style={[styles.invite, { backgroundColor: colors.sunken, borderColor: colors.line }]}>
              <Text style={[type.body, styles.flex, { color: colors.ink }]}>
                {fallback
                  ? 'Dette er teksten fra forsiden. Lag en egen Om oss-side med overskrifter, bilder og lenker.'
                  : 'Lag en Om oss-side med overskrifter, bilder og lenker.'}
              </Text>
              <PillButton label="Skriv Om oss" icon="create-outline" primary onPress={onEdit} colors={colors} nativeID="company-article-start" />
            </View>
          ) : null}
        </Card>
      );
    }
    return (
      <Card colors={colors} nativeID="company-article">
        {canEdit ? (
          <View style={styles.toolbar}>
            <PillButton label="Rediger" icon="pencil-outline" onPress={onEdit} colors={colors} />
          </View>
        ) : null}
        <View style={styles.column}>
          <ArticleBlocks blocks={shown} colors={colors} stacked={isPhone} />
        </View>
      </Card>
    );
  }

  const full = blocks.length >= ARTICLE_LIMITS.blocks;
  return (
    <Card colors={colors} nativeID="company-article-editor">
      <Text style={[type.body, { color: colors.muted }]}>
        Bygg siden med tekst og bilder. Marker tekst og bruk verktøylinjen for overskrift, fet skrift,
        lister, sitat og lenke. Et bilde kan stå i full bredde eller ved siden av en tekst.
      </Text>

      {!blocks.length ? (
        <View style={[styles.invite, { backgroundColor: colors.sunken, borderColor: colors.line }]}>
          <Text style={[type.body, styles.flex, { color: colors.ink }]}>Siden er tom. Start med en tekst eller et bilde.</Text>
          {fallback ? (
            <PillButton label="Bruk teksten fra forsiden" icon="copy-outline" onPress={() => addBlock('text', fallback)} colors={colors} />
          ) : null}
        </View>
      ) : null}

      {blocks.map((block, index) => (
        <View key={block.id} style={[styles.block, { borderColor: colors.line }]}>
          <View style={styles.blockHead}>
            <Ionicons name={block.type === 'image' ? 'image-outline' : 'text-outline'} size={16} color={colors.muted} />
            <Text style={[type.label, styles.flex, { color: colors.muted }]}>
              {block.type === 'image' ? 'Bilde' : 'Tekst'}
            </Text>
            <IconAction icon="arrow-up" label="Flytt opp" onPress={() => update((list) => moveListItem(list, block.id, -1))} disabled={index === 0} colors={colors} />
            <IconAction icon="arrow-down" label="Flytt ned" onPress={() => update((list) => moveListItem(list, block.id, 1))} disabled={index === blocks.length - 1} colors={colors} />
            <IconAction icon="trash-outline" label="Fjern blokken" tone="danger" onPress={() => update((list) => list.filter((row) => row.id !== block.id))} colors={colors} />
          </View>

          {block.type === 'text' ? (
            <ArticleTextField
              value={block.text}
              onChange={(text) => patchBlock(block.id, { text })}
              colors={colors}
              maxLength={ARTICLE_LIMITS.text}
              placeholder={index === 0 ? 'Hvem er dere, hva gjør dere, og hva står dere for?' : 'Skriv her …'}
            />
          ) : (
            <View style={styles.imageEdit}>
              {block.url ? (
                <View style={isPhone ? null : styles.thumbWrap}>
                  <ArticleImage uri={block.url} colors={colors} />
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => pickImage(block.id)}
                  disabled={images.busy}
                  accessibilityRole="button"
                  style={[styles.drop, { borderColor: colors.line, backgroundColor: colors.sunken }]}
                >
                  <Ionicons name="cloud-upload-outline" size={22} color={colors.brandInk || colors.brand} />
                  <Text style={[type.label, { color: colors.brandInk || colors.brand }]}>{images.busy ? 'Laster opp …' : 'Last opp bilde'}</Text>
                </TouchableOpacity>
              )}
              <View style={styles.row}>
                {block.url ? (
                  <PillButton label={images.busy ? 'Laster opp …' : 'Bytt bilde'} icon="image-outline" onPress={() => pickImage(block.id)} disabled={images.busy} colors={colors} />
                ) : null}
                {IMAGE_LAYOUTS.map((option) => {
                  const on = (block.layout || 'full') === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      onPress={() => patchBlock(block.id, { layout: option.id })}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
                    >
                      <Ionicons name={option.icon} size={14} color={on ? colors.brandInk || colors.brand : colors.muted} />
                      <Text style={[type.label, { color: on ? colors.brandInk || colors.brand : colors.ink }]}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                value={block.caption}
                onChangeText={(caption) => patchBlock(block.id, { caption })}
                placeholder="Bildetekst (valgfri)"
                placeholderTextColor={colors.placeholder}
                maxLength={ARTICLE_LIMITS.caption}
                accessibilityLabel="Bildetekst"
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.sunken }]}
              />
              {block.layout && block.layout !== 'full' ? (
                <ArticleTextField
                  value={block.text}
                  onChange={(text) => patchBlock(block.id, { text })}
                  colors={colors}
                  maxLength={ARTICLE_LIMITS.text}
                  minHeight={110}
                  placeholder="Tekst ved siden av bildet"
                />
              ) : null}
            </View>
          )}
        </View>
      ))}

      <View style={styles.row}>
        <PillButton label="Legg til tekst" icon="add" onPress={() => addBlock('text')} disabled={full} colors={colors} nativeID="company-article-add-text" />
        <PillButton label="Legg til bilde" icon="image-outline" onPress={() => addBlock('image')} disabled={full || images.busy} colors={colors} nativeID="company-article-add-image" />
      </View>
      {images.error ? <Text style={[type.body, { color: colors.danger }]}>{images.error}</Text> : null}
      <EditBar colors={colors} saving={saving} error={error} onSave={onSave} onCancel={onCancel} />
      {images.modal}
    </Card>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 780, gap: space.lg },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end' },
  figure: { gap: space.xxs + 2, width: '100%' },
  image: { width: '100%', borderRadius: radius.card },
  side: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  sideStacked: { flexDirection: 'column', alignItems: 'stretch', gap: space.sm },
  sideImage: { width: '42%' },
  sideText: { flex: 1, minWidth: 0 },
  invite: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm,
    borderWidth: 1, borderRadius: radius.card, padding: space.sm,
  },
  flex: { flex: 1, minWidth: 180 },
  block: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: space.xs },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  imageEdit: { gap: space.xs },
  thumbWrap: { width: '50%', maxWidth: 420 },
  drop: {
    borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.card, minHeight: 140,
    alignItems: 'center', justifyContent: 'center', gap: space.xxs,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: space.xxs, borderWidth: 1,
    borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xxs + 2,
  },
  input: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.sm, paddingVertical: space.xs, fontSize: type.body.fontSize + 1 },
});
