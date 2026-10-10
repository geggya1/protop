import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  applyImportedForm,
  blankForm,
  cloneFields,
  formAttention,
  normalizeSettings,
  starterForm,
} from '../../src/anbud/formBuilder';
import { deleteFormTemplate, saveFormTemplate } from '../../src/anbud/bidLibrary';
import { askCompanyForm, FORM_IMPORT_ACCEPT, readFormImport } from '../../src/anbud/formImport';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { pickDocument, pickImage } from '../../src/utils/media';
import { useColors } from '../../src/context/ThemeContext';
import { useApp } from '../../src/context/AppContext';
import { companyLogoOf } from '../../src/project/companyLogo';
import FormStudio from './FormStudio';
import CreateMenu from '../../components/CreateMenu';

const STARTERS = [
  { id: 'blank', title: 'Tomt skjema', icon: 'document-outline', kind: 'blank' },
  { id: 'copy', title: 'Kopier skjemaet ditt', icon: 'copy-outline', kind: 'copy' },
  { id: 'kontakt', title: 'Kontakt', icon: 'person-outline', kind: 'kontakt' },
  { id: 'befaring', title: 'Befaring', icon: 'map-outline', kind: 'befaring' },
];

async function bytesFromFile(file) {
  let blob = file?.blob || null;
  if (!blob && file?.uri && typeof fetch === 'function') {
    blob = await (await fetch(file.uri)).blob();
  }
  if (!blob || typeof blob.arrayBuffer !== 'function') return null;
  return new Uint8Array(await blob.arrayBuffer());
}

function draftFromTemplate(template, { copy = false } = {}) {
  return {
    id: copy ? '' : template.id,
    title: copy ? `${template.title} kopi`.slice(0, 80) : template.title,
    intro: template.intro || '',
    cover: template.cover || '',
    settings: normalizeSettings(template.settings),
    responses: copy ? [] : (template.responses || []).map((row) => ({ ...row, answers: { ...(row.answers || {}) } })),
    fields: copy
      ? cloneFields(template.fields)
      : template.fields.map((field) => ({ ...field, options: (field.options || []).map((row) => ({ ...row })) })),
  };
}

export default function FormBuilderScreen({
  colors: colorsProp,
  state: externalState,
  commit: externalCommit,
  onPick,
  fill = false,
}) {
  const themeColors = useColors();
  const colors = colorsProp || themeColors;
  const { family, familyId } = useApp();
  const companyLogo = companyLogoOf(family?.company);
  const [localState, setLocalState] = useState(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null);
  const [note, setNote] = useState('');
  const [noteBad, setNoteBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState('');
  const [scanToken, setScanToken] = useState(0);

  useEffect(() => {
    if (externalState) return undefined;
    let live = true;
    loadAnbudState(familyId).then((loaded) => {
      if (live) setLocalState(loaded);
    });
    return () => { live = false; };
  }, [externalState, familyId]);

  const state = externalState || localState;
  const templates = state?.formTemplates || [];
  const needle = query.trim().toLocaleLowerCase('nb-NO');
  const visible = templates.filter((row) => row.title.toLocaleLowerCase('nb-NO').includes(needle));

  function say(text, bad = false) {
    setNote(text);
    setNoteBad(bad);
  }

  async function commit(result) {
    if (!result?.ok) {
      say(result?.error || 'Kunne ikke lagre skjemaet.', true);
      return null;
    }
    if (externalCommit) await externalCommit(result);
    else {
      await saveAnbudState(result.state, familyId);
      setLocalState(result.state);
    }
    return result;
  }

  function openFresh(form) {
    setDraft({
      ...blankForm(),
      ...form,
      id: '',
      cover: form.cover || '',
      settings: normalizeSettings(form.settings),
      responses: [],
      fields: form.fields,
    });
    say('');
  }

  function openStarter(kind) {
    if (kind === 'copy') {
      const source = visible[0];
      if (!source) {
        say('Ingen skjema å kopiere ennå.', true);
        return;
      }
      setDraft(draftFromTemplate(source, { copy: true }));
      say(`Kopi av ${source.title}. Lagre når den er klar.`);
      return;
    }
    openFresh(kind === 'blank' ? blankForm() : starterForm(kind));
  }

  async function save() {
    const known = new Set((state.formTemplates || []).map((row) => row.id));
    const result = await commit(saveFormTemplate(state, draft));
    if (!result) return;
    const saved = draft.id
      ? result.state.formTemplates.find((row) => row.id === draft.id)
      : result.state.formTemplates.find((row) => row.title === draft.title && !known.has(row.id));
    say('Skjemaet er lagret.');
    if (saved) setDraft(draftFromTemplate(saved));
  }

  function adoptForm(form, text) {
    setDraft((current) => applyImportedForm(current, form));
    setScanToken((value) => value + 1);
    say(text);
  }

  async function removeTemplate(template) {
    setPendingDelete('');
    const result = await commit(deleteFormTemplate(state, template.id));
    if (result?.ok) say('Skjemaet er slettet.');
  }

  async function readDocument(mode) {
    setBusy(true);
    say('');
    try {
      const picked = mode === 'scan'
        ? await pickImage({ camera: true, edit: false })
        : await pickDocument({ accept: FORM_IMPORT_ACCEPT });
      const file = Array.isArray(picked) ? picked[0] : picked;
      if (!file) {
        setBusy(false);
        return;
      }
      const bytes = await bytesFromFile(file);
      if (!bytes?.length) {
        say('Kunne ikke lese filen.', true);
        setBusy(false);
        return;
      }
      const name = file.name || (mode === 'scan' ? 'skann.jpg' : 'dokument');
      const interpreted = await readFormImport(bytes, name, {
        ask: (payload) => askCompanyForm(payload.bytes, payload.filename, file.mimeType || ''),
      });
      const attention = formAttention(interpreted.form);
      const understood = interpreted.engine === 'text'
        ? ' fra teksten i filen'
        : interpreted.engine?.includes('ocr')
          ? ' fra bildet, med OCR'
          : ' fra dokumentet';
      const review = attention.issues.length
        ? ` ${attention.issues.length} punkt bør ses over.`
        : '';
      const kept = draft?.id ? ' Lagre oppdaterer dette skjemaet.' : '';
      const design = interpreted.summary ? ` ${interpreted.summary}` : '';
      adoptForm(interpreted.form, `Skjemaet er lest${understood}.${design} Ingenting er lagret før du trykker Lagre.${review}${kept}`);
    } catch (err) {
      const denied = err?.message === 'camera-denied';
      say(denied ? 'Gi tilgang til kamera, eller bruk Importer.' : (err?.message || 'Kunne ikke lese dokumentet.'), true);
    }
    setBusy(false);
  }

  if (!state) return <Text style={{ color: colors.muted }}>Henter skjemaene …</Text>;

  if (draft) {
    return (
      <FormStudio
        key={scanToken}
        draft={draft}
        colors={colors}
        busy={busy}
        note={note}
        noteBad={noteBad}
        fill={fill}
        onDraft={setDraft}
        onBack={() => { setDraft(null); say(''); }}
        onSave={save}
        onScan={() => readDocument('scan')}
        onImport={() => readDocument('import')}
        companyLogo={companyLogo}
      />
    );
  }

  return (
    <ScrollView style={fill ? { flex: 1 } : undefined} contentContainerStyle={styles.list}>
      <CreateMenu
        label="Nytt skjema"
        title="Nytt skjema"
        info="AI-scan og import leser bilde, PDF, Word eller tekst. Bokser, avkrysninger og kolonner blir felt du kan rette før du lagrer."
        actions={[
          { id: 'scan', label: busy ? 'Leser …' : 'AI-scan', primary: true, onPress: () => readDocument('scan'), disabled: busy },
          { id: 'import', label: busy ? 'Leser …' : 'Importer', onPress: () => readDocument('import'), disabled: busy },
        ]}
      />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Søk i skjemaer"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
      <View style={styles.grid}>
        {STARTERS.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => openStarter(item.kind)}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            style={[styles.starter, { borderColor: colors.line, backgroundColor: colors.card }]}
          >
            <View style={[styles.icon, { backgroundColor: colors.sunken }]}>
              <Ionicons name={item.icon} size={22} color={colors.brand} />
            </View>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{item.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand }}>{note}</Text>}
      <Text style={[styles.kicker, { color: colors.muted }]}>Nylige skjemaer</Text>
      {visible.map((template) => (
        <View key={template.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={() => { setDraft(draftFromTemplate(template)); say(''); }} accessibilityRole="button">
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{template.title}</Text>
            <Text style={{ color: colors.muted }}>
              {template.fields.length} spørsmål
              {template.responses?.length ? ` · ${template.responses.length} svar` : ''}
              {template.intro ? ` · ${template.intro}` : ''}
            </Text>
          </TouchableOpacity>
          <View style={styles.row}>
            {onPick ? (
              <TouchableOpacity onPress={() => onPick(template.id)} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Hent inn</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => { setDraft(draftFromTemplate(template)); say(''); }} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Åpne</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setDraft(draftFromTemplate(template, { copy: true })); say(`Kopi av ${template.title}.`); }} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Kopier</Text>
            </TouchableOpacity>
            {pendingDelete === template.id ? (
              <View style={styles.confirm}>
                <Text style={{ color: colors.ink }}>Slette «{template.title}»? Svarene i skjemaet følger med.</Text>
                <TouchableOpacity onPress={() => removeTemplate(template)} accessibilityRole="button" accessibilityLabel={`Slett ${template.title} nå`}>
                  <Text style={{ color: colors.danger, fontWeight: '700' }}>Slett nå</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPendingDelete('')} accessibilityRole="button">
                  <Text style={{ color: colors.muted }}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setPendingDelete(template.id)} accessibilityRole="button" accessibilityLabel={`Slett ${template.title}`}>
                <Text style={{ color: colors.danger }}>Slett</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
      {!visible.length ? <Text style={{ color: colors.muted }}>Ingen skjema treffer søket.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, padding: 12, paddingBottom: 32 },
  kicker: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  starter: { width: 168, flexGrow: 1, borderWidth: 1, borderRadius: 16, padding: 12, gap: 6 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  confirm: { gap: 8, paddingTop: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
