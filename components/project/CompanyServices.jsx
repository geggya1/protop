/**
 * Tjenester: seksjoner med overskrift og kort, som på en vanlig tjenesteside.
 * Bildekort (bilde, tittel og tekst i rader på fire) eller tekst i to kolonner.
 * Redigering skjer på fanen når «Rediger side» er på; lagring går via hele siden.
 */
import React, { useState } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  SERVICE_LAYOUTS, SERVICE_LIMITS, gridColumns, gridItemWidth, moveListItem, newServiceItem, newServiceSection,
} from '../../src/project/companyPage';
import { radius, space, type } from '../../src/ui/tokens';
import {
  Card, EditBar, EmptyNote, IconAction, PillButton,
} from './ProfileParts';
import { useCroppedUpload } from './useCroppedUpload';

const GAP = space.lg;
const CARD_ASPECTS = [
  { id: 'card', label: 'Kort', value: 3 / 2 },
  { id: 'wide', label: 'Bred', value: 16 / 9 },
  { id: 'square', label: 'Kvadrat', value: 1 },
];

function Field({ value, onChangeText, placeholder, colors, multiline, maxLength, label, strong }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.placeholder}
      multiline={multiline}
      maxLength={maxLength}
      accessibilityLabel={label}
      textAlignVertical={multiline ? 'top' : 'center'}
      style={[
        styles.input,
        strong && styles.inputStrong,
        multiline && styles.inputMulti,
        { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card },
      ]}
    />
  );
}

/** Rutenett som deler bredden i like kolonner (måles med onLayout). */
function Grid({ columns, min, children }) {
  const [width, setWidth] = useState(0);
  const count = gridColumns(width, { min, gap: GAP, max: columns });
  const itemWidth = gridItemWidth(width, count, GAP);
  return (
    <View style={styles.grid} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width ? React.Children.map(children, (child) => (
        child ? <View style={{ width: itemWidth }}>{child}</View> : null
      )) : null}
    </View>
  );
}

function SectionView({ section, colors }) {
  const cards = section.layout !== 'columns';
  return (
    <View style={styles.section}>
      {section.title ? (
        <View style={[styles.sectionHead, { borderBottomColor: colors.line }]}>
          <Text accessibilityRole="header" style={[type.h2, styles.light, { color: colors.ink }]}>{section.title}</Text>
        </View>
      ) : null}
      {section.intro ? <Text style={[styles.intro, { color: colors.muted }]}>{section.intro}</Text> : null}
      <Grid columns={cards ? 4 : 2} min={cards ? 200 : 280}>
        {section.items.map((item) => (
          <View key={item.id} style={styles.item}>
            {cards && item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={[styles.cardImage, { backgroundColor: colors.sunken }]}
                resizeMode="cover"
                accessibilityLabel={item.title || 'Bilde'}
              />
            ) : null}
            {item.title ? (
              <Text style={[cards ? type.bodyStrong : type.title, cards ? null : styles.light, { color: colors.ink }]}>{item.title}</Text>
            ) : null}
            {item.text ? <Text style={[styles.itemText, { color: colors.muted }]}>{item.text}</Text> : null}
          </View>
        ))}
      </Grid>
    </View>
  );
}

export default function CompanyServices({
  sections,
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
  const list = Array.isArray(sections) ? sections : [];
  const images = useCroppedUpload({
    familyId,
    folder: 'companyPage',
    aspect: CARD_ASPECTS[0].value,
    aspectPair: [3, 2],
    aspects: CARD_ASPECTS,
    title: 'Beskjær bilde',
    maxEdge: 1400,
  });

  function update(fn) {
    onUpdate((prev) => fn(Array.isArray(prev) ? prev : []));
  }

  function patchSection(id, partial) {
    update((rows) => rows.map((row) => (row.id === id ? { ...row, ...partial } : row)));
  }

  function patchItems(sectionId, fn) {
    update((rows) => rows.map((row) => (row.id === sectionId ? { ...row, items: fn(row.items || []) } : row)));
  }

  function patchItem(sectionId, itemId, partial) {
    patchItems(sectionId, (items) => items.map((item) => (item.id === itemId ? { ...item, ...partial } : item)));
  }

  async function pickImage(sectionId, itemId) {
    const url = await images.choose();
    if (url) patchItem(sectionId, itemId, { imageUrl: url });
  }

  if (!editing) {
    const shown = list
      .map((section) => ({ ...section, items: (section.items || []).filter((item) => item.title || item.text || item.imageUrl) }))
      .filter((section) => section.title || section.intro || section.items.length);
    if (!shown.length) {
      return (
        <Card colors={colors} nativeID="company-services">
          <EmptyNote colors={colors}>
            {canEdit ? 'Vis hva bedriften tilbyr: hvem dere hjelper, og hvilke roller dere tar i prosjektene.' : 'Ingen tjenester er publisert.'}
          </EmptyNote>
          {canEdit ? (
            <View style={styles.row}>
              <PillButton label="Legg til tjenester" icon="add" primary onPress={onEdit} colors={colors} nativeID="company-services-start" />
            </View>
          ) : null}
        </Card>
      );
    }
    return (
      <Card colors={colors} nativeID="company-services" style={styles.page}>
        {canEdit ? (
          <View style={styles.toolbar}>
            <PillButton label="Rediger" icon="pencil-outline" onPress={onEdit} colors={colors} />
          </View>
        ) : null}
        {shown.map((section) => <SectionView key={section.id} section={section} colors={colors} />)}
      </Card>
    );
  }

  const fullSections = list.length >= SERVICE_LIMITS.sections;
  return (
    <Card colors={colors} nativeID="company-services-editor">
      <Text style={[type.body, { color: colors.muted }]}>
        Del siden i seksjoner, for eksempel «Hvem kan vi bistå?» med bildekort og «Roller i prosjektet» med tekst i to kolonner.
      </Text>

      {list.map((section, index) => {
        const items = section.items || [];
        const cards = section.layout !== 'columns';
        return (
          <View key={section.id} style={[styles.block, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
            <View style={styles.blockHead}>
              <Text style={[type.label, styles.flex, { color: colors.muted }]}>Seksjon {index + 1}</Text>
              <IconAction icon="arrow-up" label="Flytt seksjonen opp" onPress={() => update((rows) => moveListItem(rows, section.id, -1))} disabled={index === 0} colors={colors} />
              <IconAction icon="arrow-down" label="Flytt seksjonen ned" onPress={() => update((rows) => moveListItem(rows, section.id, 1))} disabled={index === list.length - 1} colors={colors} />
              <IconAction icon="trash-outline" label="Fjern seksjonen" tone="danger" onPress={() => update((rows) => rows.filter((row) => row.id !== section.id))} colors={colors} />
            </View>
            <Field value={section.title} onChangeText={(title) => patchSection(section.id, { title })} placeholder="Overskrift, f.eks. Hvem kan vi bistå?" label="Overskrift" colors={colors} maxLength={SERVICE_LIMITS.title} strong />
            <Field value={section.intro} onChangeText={(intro) => patchSection(section.id, { intro })} placeholder="Ingress (valgfri)" label="Ingress" colors={colors} multiline maxLength={SERVICE_LIMITS.intro} />
            <View style={styles.row}>
              {SERVICE_LAYOUTS.map((option) => {
                const on = (section.layout || 'cards') === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    onPress={() => patchSection(section.id, { layout: option.id })}
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

            <Grid columns={cards ? 3 : 2} min={240}>
              {items.map((item, itemIndex) => (
                <View key={item.id} style={[styles.itemEdit, { borderColor: colors.line, backgroundColor: colors.card }]}>
                  {cards ? (
                    item.imageUrl ? (
                      <TouchableOpacity onPress={() => pickImage(section.id, item.id)} disabled={images.busy} accessibilityRole="button" accessibilityLabel="Bytt bilde">
                        <Image source={{ uri: item.imageUrl }} style={[styles.cardImage, { backgroundColor: colors.sunken }]} resizeMode="cover" />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => pickImage(section.id, item.id)}
                        disabled={images.busy}
                        accessibilityRole="button"
                        style={[styles.drop, { borderColor: colors.line, backgroundColor: colors.sunken }]}
                      >
                        <Ionicons name="image-outline" size={20} color={colors.brandInk || colors.brand} />
                        <Text style={[type.caption, { color: colors.brandInk || colors.brand }]}>{images.busy ? 'Laster opp …' : 'Last opp bilde'}</Text>
                      </TouchableOpacity>
                    )
                  ) : null}
                  <Field value={item.title} onChangeText={(title) => patchItem(section.id, item.id, { title })} placeholder={cards ? 'Tittel, f.eks. Privat næring' : 'Tittel, f.eks. Prosjektledelse'} label="Tittel" colors={colors} maxLength={SERVICE_LIMITS.title} strong />
                  <Field value={item.text} onChangeText={(text) => patchItem(section.id, item.id, { text })} placeholder="Kort beskrivelse" label="Beskrivelse" colors={colors} multiline maxLength={SERVICE_LIMITS.text} />
                  <View style={styles.itemActions}>
                    <IconAction icon="arrow-back" label="Flytt tidligere" onPress={() => patchItems(section.id, (rows) => moveListItem(rows, item.id, -1))} disabled={itemIndex === 0} colors={colors} />
                    <IconAction icon="arrow-forward" label="Flytt senere" onPress={() => patchItems(section.id, (rows) => moveListItem(rows, item.id, 1))} disabled={itemIndex === items.length - 1} colors={colors} />
                    {cards && item.imageUrl ? (
                      <IconAction icon="close-circle-outline" label="Fjern bildet" onPress={() => patchItem(section.id, item.id, { imageUrl: '' })} colors={colors} />
                    ) : null}
                    <View style={styles.flexSpacer} />
                    <IconAction icon="trash-outline" label="Fjern kortet" tone="danger" onPress={() => patchItems(section.id, (rows) => rows.filter((row) => row.id !== item.id))} colors={colors} />
                  </View>
                </View>
              ))}
            </Grid>
            <View style={styles.row}>
              <PillButton
                label={cards ? 'Legg til kort' : 'Legg til punkt'}
                icon="add"
                onPress={() => patchItems(section.id, (rows) => [...rows, newServiceItem()].slice(0, SERVICE_LIMITS.items))}
                disabled={items.length >= SERVICE_LIMITS.items}
                colors={colors}
              />
            </View>
          </View>
        );
      })}

      <View style={styles.row}>
        <PillButton label="Ny seksjon med bildekort" icon="grid-outline" onPress={() => update((rows) => [...rows, newServiceSection('cards')])} disabled={fullSections} colors={colors} nativeID="company-services-add-cards" />
        <PillButton label="Ny seksjon med tekst" icon="reorder-two-outline" onPress={() => update((rows) => [...rows, newServiceSection('columns')])} disabled={fullSections} colors={colors} nativeID="company-services-add-columns" />
      </View>
      {images.error ? <Text style={[type.body, { color: colors.danger }]}>{images.error}</Text> : null}
      <EditBar colors={colors} saving={saving} error={error} onSave={onSave} onCancel={onCancel} />
      {images.modal}
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.xl },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: -space.md },
  section: { gap: space.md },
  sectionHead: { borderBottomWidth: 1, paddingBottom: space.xs },
  light: { fontWeight: '400' },
  intro: { fontSize: type.body.fontSize + 1, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  item: { gap: space.xs },
  cardImage: { width: '100%', aspectRatio: 3 / 2, borderRadius: radius.control },
  itemText: { fontSize: type.body.fontSize - 1, lineHeight: 20 },
  block: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: space.xs },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1 },
  flexSpacer: { flexGrow: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: space.xxs, borderWidth: 1,
    borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xxs + 2,
  },
  itemEdit: { borderWidth: 1, borderRadius: radius.card, padding: space.xs, gap: space.xs },
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  drop: {
    width: '100%', aspectRatio: 3 / 2, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.control,
    alignItems: 'center', justifyContent: 'center', gap: space.xxs,
  },
  input: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.sm, paddingVertical: space.xs, fontSize: type.body.fontSize },
  inputStrong: { fontWeight: '600' },
  inputMulti: { minHeight: 84 },
});
