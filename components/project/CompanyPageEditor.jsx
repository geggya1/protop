import React from 'react';
import {
  Image, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import {
  POST_ASPECTS, moduleLabel, movePageModule, setPageModuleColumn, togglePageModule,
} from '../../src/project/companyPage';
import { useCroppedUpload } from './useCroppedUpload';

function Field({ label, value, onChangeText, colors, multiline, placeholder, keyboardType }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' || keyboardType === 'url' ? 'none' : 'sentences'}
        style={[
          styles.input,
          { color: colors.ink, borderColor: colors.line, backgroundColor: colors.sunken },
          multiline && styles.inputMulti,
        ]}
      />
    </View>
  );
}

function newCard(prefix) {
  return {
    id: `${prefix}-${Date.now().toString(36)}`,
    title: '',
    text: '',
    imageUrl: '',
  };
}

export default function CompanyPageEditor({
  draft,
  colors,
  saving,
  error,
  coverBusy,
  onChange,
  onSave,
  onCancel,
  onPickCover,
  onClearCover,
  onOpenSettings,
}) {
  const { familyId } = useApp();
  const images = useCroppedUpload({
    familyId,
    folder: 'companyPage',
    aspect: 16 / 9,
    aspectPair: [16, 9],
    aspects: POST_ASPECTS,
    title: 'Beskjær bilde',
  });

  function patch(partial) {
    onChange({ ...draft, ...partial });
  }

  function applyModules(next) {
    onChange({ ...draft, modules: next.modules });
  }

  function patchList(key, id, partial) {
    patch({
      [key]: draft[key].map((row) => (row.id === id ? { ...row, ...partial } : row)),
    });
  }

  async function pickCardImage(key, id) {
    const url = await images.choose();
    if (url) patchList(key, id, { imageUrl: url });
  }

  return (
    <View
      nativeID="company-page-editor"
      id="company-page-editor"
      style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.line }]}
    >
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.muted }]}>Tilpass profilen</Text>
          <Text style={[styles.title, { color: colors.ink }]}>Rediger side</Text>
        </View>
        <TouchableOpacity onPress={onCancel} accessibilityLabel="Avbryt redigering">
          <Ionicons name="close" size={20} color={colors.ink} />
        </TouchableOpacity>
      </View>
      <Text style={[styles.help, { color: colors.muted }]}>
        Vis, skjul og flytt modulene. Tung informasjon som register, roller og signaturrett
        ligger under Om oss, og kan også hentes fram på forsiden.
      </Text>

      <Text style={[styles.section, { color: colors.ink }]}>Moduler på forsiden</Text>
      {draft.modules.map((row) => {
        const same = draft.modules.filter((item) => item.column === row.column);
        const first = same[0]?.id === row.id;
        const last = same[same.length - 1]?.id === row.id;
        return (
          <View key={row.id} style={[styles.moduleRow, { borderColor: colors.line }]}>
            <TouchableOpacity
              onPress={() => applyModules(togglePageModule(draft, row.id))}
              accessibilityRole="button"
              accessibilityLabel={row.visible ? `Skjul ${moduleLabel(row.id)}` : `Vis ${moduleLabel(row.id)}`}
            >
              <Ionicons name={row.visible ? 'eye-outline' : 'eye-off-outline'} size={18} color={row.visible ? colors.brand : colors.muted} />
            </TouchableOpacity>
            <Text style={[styles.moduleLabel, { color: colors.ink }]}>{moduleLabel(row.id)}</Text>
            <Text style={[styles.columnTag, { color: colors.muted }]}>{row.column === 'main' ? 'Hoved' : 'Side'}</Text>
            <TouchableOpacity
              onPress={() => applyModules(movePageModule(draft, row.id, -1))}
              disabled={first}
              accessibilityLabel="Flytt opp"
            >
              <Ionicons name="chevron-up" size={18} color={first ? colors.line : colors.ink} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => applyModules(movePageModule(draft, row.id, 1))}
              disabled={last}
              accessibilityLabel="Flytt ned"
            >
              <Ionicons name="chevron-down" size={18} color={last ? colors.line : colors.ink} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => applyModules(setPageModuleColumn(draft, row.id, row.column === 'main' ? 'side' : 'main'))}
              accessibilityLabel="Bytt kolonne"
            >
              <Ionicons name="swap-horizontal-outline" size={18} color={colors.ink} />
            </TouchableOpacity>
          </View>
        );
      })}

      <Text style={[styles.section, { color: colors.ink }]}>Profiltekst</Text>
      <Field label="Kort beskrivelse" value={draft.tagline} colors={colors} placeholder="Hva bedriften driver med" onChangeText={(tagline) => patch({ tagline })} />
      <Field label="Om oss" value={draft.about} colors={colors} multiline placeholder="Tekst på forsiden. Tomt felt bruker formålet fra Enhetsregisteret." onChangeText={(about) => patch({ about })} />
      <Field label="Telefon som vises" value={draft.phone} colors={colors} placeholder="Tomt felt bruker registrert telefon" onChangeText={(phone) => patch({ phone })} />
      <Field label="E-post som vises" value={draft.email} colors={colors} keyboardType="email-address" placeholder="post@bedrift.no" onChangeText={(email) => patch({ email })} />
      <Field label="Nettsted" value={draft.website} colors={colors} keyboardType="url" placeholder="www.bedrift.no" onChangeText={(website) => patch({ website })} />
      <Field label="Adresse som vises" value={draft.address} colors={colors} placeholder="Tomt felt bruker forretningsadressen" onChangeText={(address) => patch({ address })} />

      <Text style={[styles.section, { color: colors.ink }]}>Banner</Text>
      <View style={styles.row}>
        <TouchableOpacity onPress={onPickCover} disabled={coverBusy} style={[styles.smallBtn, { backgroundColor: colors.brand }]}>
          <Text style={styles.smallBtnText}>{coverBusy ? 'Laster…' : 'Last opp banner'}</Text>
        </TouchableOpacity>
        {draft.coverUrl ? (
          <TouchableOpacity onPress={onClearCover} style={[styles.smallBtn, { backgroundColor: colors.sunken }]}>
            <Text style={[styles.smallBtnText, { color: colors.ink }]}>Fjern banner</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {draft.coverUrl ? <Image source={{ uri: draft.coverUrl }} style={styles.cover} /> : null}

      <Text style={[styles.section, { color: colors.ink }]}>Høydepunkter</Text>
      {draft.highlights.map((row) => (
        <View key={row.id} style={styles.stack}>
          <Field label="Tittel" value={row.title} colors={colors} onChangeText={(title) => patchList('highlights', row.id, { title })} />
          <Field label="Tekst" value={row.text} colors={colors} onChangeText={(text) => patchList('highlights', row.id, { text })} />
        </View>
      ))}

      <Text style={[styles.section, { color: colors.ink }]}>Åpningstider</Text>
      {draft.hours.map((row) => (
        <View key={row.id} style={styles.stack}>
          <Field label="Dager" value={row.label} colors={colors} onChangeText={(label) => patchList('hours', row.id, { label })} />
          <TouchableOpacity
            onPress={() => patchList('hours', row.id, { closed: !row.closed })}
            style={styles.checkRow}
          >
            <Ionicons name={row.closed ? 'checkbox-outline' : 'square-outline'} size={18} color={colors.brand} />
            <Text style={{ color: colors.ink }}>Stengt</Text>
          </TouchableOpacity>
          {!row.closed ? (
            <View style={styles.hoursRow}>
              <View style={{ flex: 1 }}>
                <Field label="Fra" value={row.open} colors={colors} placeholder="07:00" onChangeText={(open) => patchList('hours', row.id, { open })} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Til" value={row.close} colors={colors} placeholder="15:00" onChangeText={(close) => patchList('hours', row.id, { close })} />
              </View>
            </View>
          ) : null}
        </View>
      ))}

      <Text style={[styles.section, { color: colors.ink }]}>Presentasjon</Text>
      <Field label="Videolenke" value={draft.videoUrl} colors={colors} keyboardType="url" placeholder="YouTube eller annen lenke" onChangeText={(videoUrl) => patch({ videoUrl })} />
      <Field label="Videotittel" value={draft.videoTitle} colors={colors} placeholder="Se vår presentasjon" onChangeText={(videoTitle) => patch({ videoTitle })} />

      <Text style={[styles.section, { color: colors.ink }]}>Tjenester</Text>
      {draft.services.map((row) => (
        <CardFields
          key={row.id}
          row={row}
          colors={colors}
          busy={images.busy}
          onChange={(partial) => patchList('services', row.id, partial)}
          onImage={() => pickCardImage('services', row.id)}
          onRemove={() => patch({ services: draft.services.filter((item) => item.id !== row.id) })}
        />
      ))}
      <TouchableOpacity onPress={() => patch({ services: [...draft.services, newCard('tjeneste')] })}>
        <Text style={{ color: colors.brand }}>Legg til tjeneste</Text>
      </TouchableOpacity>

      <Text style={[styles.section, { color: colors.ink }]}>Utvalgte prosjekter</Text>
      {draft.projects.map((row) => (
        <CardFields
          key={row.id}
          row={row}
          colors={colors}
          busy={images.busy}
          onChange={(partial) => patchList('projects', row.id, partial)}
          onImage={() => pickCardImage('projects', row.id)}
          onRemove={() => patch({ projects: draft.projects.filter((item) => item.id !== row.id) })}
        />
      ))}
      <TouchableOpacity onPress={() => patch({ projects: [...draft.projects, newCard('prosjekt')] })}>
        <Text style={{ color: colors.brand }}>Legg til prosjekt</Text>
      </TouchableOpacity>

      <Text style={[styles.section, { color: colors.ink }]}>Bærekraft og ansatte</Text>
      <Field label="Bærekraft" value={draft.sustainability} colors={colors} multiline placeholder="Kort om miljø og samfunnsansvar" onChangeText={(sustainability) => patch({ sustainability })} />
      <TouchableOpacity onPress={() => patch({ showEmployees: !draft.showEmployees })} style={styles.checkRow}>
        <Ionicons name={draft.showEmployees ? 'checkbox-outline' : 'square-outline'} size={18} color={colors.brand} />
        <Text style={{ color: colors.ink, flex: 1 }}>Vis ansatte med navn og stilling på profilen</Text>
      </TouchableOpacity>
      <Field label="Ledige stillinger" value={draft.jobs.text} colors={colors} multiline placeholder="Kort tekst i stillingskortet" onChangeText={(text) => patch({ jobs: { ...draft.jobs, text } })} />
      <Field label="Lenke til stillinger" value={draft.jobs.url} colors={colors} keyboardType="url" placeholder="Valgfri lenke" onChangeText={(url) => patch({ jobs: { ...draft.jobs, url } })} />

      {!!(error || images.error) && <Text style={{ color: colors.danger }}>{error || images.error}</Text>}
      <View style={styles.actions}>
        <TouchableOpacity onPress={onSave} disabled={saving} style={[styles.save, { backgroundColor: colors.brand, opacity: saving ? 0.6 : 1 }]}>
          <Text style={styles.saveText}>{saving ? 'Lagrer…' : 'Lagre siden'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} style={[styles.save, { backgroundColor: colors.sunken }]}>
          <Text style={[styles.saveText, { color: colors.ink }]}>Avbryt</Text>
        </TouchableOpacity>
        {onOpenSettings ? (
          <TouchableOpacity onPress={onOpenSettings} style={styles.settingsLink} accessibilityRole="button">
            <Ionicons name="settings-outline" size={16} color={colors.brand} />
            <Text style={{ color: colors.brand }}>Selskapsinnstillinger</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {images.modal}
    </View>
  );
}

function CardFields({ row, colors, busy, onChange, onImage, onRemove }) {
  return (
    <View style={[styles.cardBox, { borderColor: colors.line }]}>
      <Field label="Tittel" value={row.title} colors={colors} onChangeText={(title) => onChange({ title })} />
      <Field label="Tekst" value={row.text} colors={colors} multiline onChangeText={(text) => onChange({ text })} />
      {row.imageUrl ? <Image source={{ uri: row.imageUrl }} style={styles.thumb} /> : null}
      <View style={styles.row}>
        <TouchableOpacity onPress={onImage} disabled={busy}>
          <Text style={{ color: colors.brand }}>{busy ? 'Venter…' : (row.imageUrl ? 'Bytt bilde' : 'Last opp bilde')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onRemove}>
          <Text style={{ color: colors.danger }}>Fjern</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  kicker: { fontSize: 12 },
  title: { fontSize: 18, fontWeight: '600' },
  help: { fontSize: 13, lineHeight: 18 },
  section: { fontSize: 15, fontWeight: '600', marginTop: 8 },
  field: { gap: 4, flexGrow: 1 },
  label: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  inputMulti: { minHeight: 84, textAlignVertical: 'top' },
  moduleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  moduleLabel: { flex: 1, fontSize: 14 },
  columnTag: { fontSize: 12, width: 44 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  smallBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { color: '#fff', fontSize: 13 },
  cover: { width: '100%', height: 120, borderRadius: 12 },
  stack: { gap: 8 },
  hoursRow: { flexDirection: 'row', gap: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardBox: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  thumb: { width: 160, height: 90, borderRadius: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 6 },
  save: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  saveText: { color: '#fff', fontSize: 14 },
  settingsLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
