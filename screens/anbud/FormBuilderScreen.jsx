import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  blankForm,
  cloneFields,
  formFromPlainText,
  normalizeSettings,
  starterForm,
} from '../../src/anbud/formBuilder';
import { deleteFormTemplate, saveFormTemplate } from '../../src/anbud/bidLibrary';
import { fileToDataUrl, generateCompanyForm } from '../../src/anbud/intakeClient';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { pickDocument, pickImage } from '../../src/utils/media';
import { useColors } from '../../src/context/ThemeContext';
import { useApp } from '../../src/context/AppContext';
import { companyLogoOf } from '../../src/project/companyLogo';
import FormStudio from './FormStudio';
import CreateMenu from '../../components/CreateMenu';

const IMPORT_ACCEPT = 'image/*,.pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const STARTERS = [
  { id: 'blank', title: 'Tomt skjema', text: 'Ett flervalgsspørsmål, klart til å bygges.', icon: 'document-outline', kind: 'blank' },
  { id: 'copy', title: 'Kopier skjemaet ditt', text: 'Lag en kopi av et skjema du allerede har.', icon: 'copy-outline', kind: 'copy' },
  { id: 'kontakt', title: 'Kontakt', text: 'Navn, e-post, telefon og melding.', icon: 'person-outline', kind: 'kontakt' },
  { id: 'befaring', title: 'Befaring', text: 'Dato, tid, adresse, tilstand og bilde.', icon: 'map-outline', kind: 'befaring' },
];

function plainTextFromDataUrl(dataUrl, mimeType) {
  if (!/^text\//i.test(mimeType || '') && !/text\/plain/i.test(dataUrl || '')) return '';
  try {
    const cleaned = String(dataUrl || '').replace(/^data:[^;]+;base64,/, '');
    const binary = atob(cleaned);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
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
  const { family } = useApp();
  const companyLogo = companyLogoOf(family?.company);
  const [localState, setLocalState] = useState(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null);
  const [note, setNote] = useState('');
  const [noteBad, setNoteBad] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (externalState) return undefined;
    let live = true;
    loadAnbudState().then((loaded) => {
      if (live) setLocalState(loaded);
    });
    return () => { live = false; };
  }, [externalState]);

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
      await saveAnbudState(result.state);
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
    setDraft((current) => ({
      ...blankForm(),
      id: current?.id && current.title ? '' : (current?.id || ''),
      title: form.title || current?.title || '',
      intro: form.intro || '',
      cover: form.cover || '',
      settings: normalizeSettings(form.settings),
      responses: [],
      fields: form.fields,
    }));
    say(text);
  }

  async function readDocument(mode) {
    setBusy(true);
    say('');
    try {
      const picked = mode === 'scan'
        ? await pickImage({ camera: true, edit: false })
        : await pickDocument({ accept: IMPORT_ACCEPT });
      const file = Array.isArray(picked) ? picked[0] : picked;
      if (!file) {
        setBusy(false);
        return;
      }
      const dataUrl = await fileToDataUrl(file);
      if (!dataUrl) {
        say('Kunne ikke lese filen.', true);
        setBusy(false);
        return;
      }
      const name = file.name || (mode === 'scan' ? 'skann.jpg' : 'dokument');
      const plain = plainTextFromDataUrl(dataUrl, file.mimeType);
      try {
        const data = await generateCompanyForm(dataUrl, name);
        if (data?.form?.fields?.length) {
          adoptForm(data.form, 'Malen er lest med AI. Se over feltene og lagre.');
          setBusy(false);
          return;
        }
        say(data?.error || 'AI fant ikke et skjema.', true);
      } catch (err) {
        say(err?.message || 'AI svarte ikke.', true);
      }
      if (plain) {
        const local = formFromPlainText(plain, name.replace(/\.[^.]+$/, ''));
        if (local.ok) {
          adoptForm(local.form, 'AI svarte ikke. Feltene er lest rett fra teksten. Se over dem og lagre.');
          setBusy(false);
          return;
        }
      }
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
        info="AI-scan og import lager en mal fra bilde, PDF, Word eller tekst. Ferdige utgangspunkt ligger under."
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
      <Text style={[styles.kicker, { color: colors.muted }]}>Nytt skjema</Text>
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
            <Text style={{ color: colors.muted, fontSize: 13 }}>{item.text}</Text>
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
            <TouchableOpacity onPress={() => commit(deleteFormTemplate(state, template.id))} accessibilityRole="button">
              <Text style={{ color: colors.danger }}>Slett</Text>
            </TouchableOpacity>
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
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
