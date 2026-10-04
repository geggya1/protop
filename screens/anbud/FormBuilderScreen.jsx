import React, { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  FIELD_TYPES,
  applyDrag,
  blankForm,
  dragTargetIndex,
  duplicateField,
  fieldType,
  formFromPlainText,
  insertField,
  insertionIndex,
  moveField,
} from '../../src/anbud/formBuilder';
import { deleteFormTemplate, saveFormTemplate } from '../../src/anbud/bidLibrary';
import { fileToDataUrl, generateCompanyForm } from '../../src/anbud/intakeClient';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { pickDocument, pickImage } from '../../src/utils/media';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import FormAnswer from './FormAnswer';
import FormFieldFace, { fieldIcon } from './FormFieldFace';

const IMPORT_ACCEPT = 'image/*,.pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function pointFrom(event) {
  const source = event?.nativeEvent || event || {};
  const x = Number(source.clientX ?? source.pageX);
  const y = Number(source.clientY ?? source.pageY);
  return { x, y };
}

function nodeRect(node) {
  if (!node || typeof node.getBoundingClientRect !== 'function') return null;
  const rect = node.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    height: rect.height,
  };
}

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

function InsertGap({ open, hot, colors }) {
  const height = hot ? 76 : open ? 16 : 0;
  return (
    <View
      style={[
        styles.gap,
        {
          height,
          marginVertical: height ? 4 : 0,
          borderWidth: hot ? 1 : 0,
          borderColor: colors.brand,
          backgroundColor: hot ? colors.brandSoft : 'transparent',
        },
      ]}
    >
      {hot ? <Text style={{ color: colors.brand, fontWeight: '600' }}>Slipp feltet her</Text> : null}
    </View>
  );
}

function Ghost({ drag, colors }) {
  if (!drag?.active || !Number.isFinite(drag.x) || !Number.isFinite(drag.y)) return null;
  const node = (
    <View
      pointerEvents="none"
      style={[
        styles.ghost,
        {
          left: drag.x + 14,
          top: drag.y + 12,
          backgroundColor: colors.card,
          borderColor: colors.brand,
        },
      ]}
    >
      <Text style={{ color: colors.ink, fontWeight: '600' }}>{drag.label}</Text>
    </View>
  );
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    try {
      const { createPortal } = require('react-dom');
      return createPortal(node, document.body);
    } catch {
      return node;
    }
  }
  return node;
}

function FieldSidebar({
  colors,
  busy,
  active,
  preview,
  onAdd,
  onGrip,
  onScan,
  onImport,
  onPatch,
  onDuplicate,
  onDelete,
  onMove,
  docked,
  onClose,
}) {
  return (
    <View style={{ gap: 14 }}>
      {onClose ? (
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk feltmenyen">
          <Text style={{ color: colors.brand }}>Lukk</Text>
        </TouchableOpacity>
      ) : null}
      <View style={{ gap: 8 }}>
        <Text style={[styles.kicker, { color: colors.muted }]}>Mal fra dokument</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          AI-scan leser et bilde. Import leser PDF, Word, tekst eller bilde og lager en mal.
        </Text>
        <View style={styles.row}>
          <TouchableOpacity
            onPress={onScan}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="AI-scan av skjema"
            style={[styles.btn, { backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]}
          >
            <Text style={{ color: '#fff' }}>{busy ? 'Leser …' : 'AI-scan'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onImport}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Importer dokument som mal"
            style={[styles.btn, { backgroundColor: colors.ink, opacity: busy ? 0.6 : 1 }]}
          >
            <Text style={{ color: colors.bg }}>{busy ? 'Leser …' : 'Importer'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={[styles.kicker, { color: colors.muted }]}>Legg til felt</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {docked
            ? 'Trykk for å legge feltet nederst. Dra håndtaket og slipp der skjemaet skal utvide seg.'
            : 'Trykk et felt for å legge det inn i skjemaet.'}
        </Text>
        {FIELD_TYPES.map((type) => (
          <View key={type.id} style={[styles.paletteRow, { borderColor: colors.line, backgroundColor: colors.bg }]}>
            {docked ? (
              <View
                onPointerDown={(event) => onGrip(type, event)}
                accessibilityRole="button"
                accessibilityLabel={`Dra ${type.label} inn i skjemaet`}
                style={[styles.grip, { backgroundColor: colors.sunken }]}
              >
                <Ionicons name="reorder-three" size={18} color={colors.muted} />
              </View>
            ) : null}
            <TouchableOpacity
              onPress={() => onAdd(type.id)}
              accessibilityRole="button"
              accessibilityLabel={`Legg til ${type.label}`}
              style={styles.paletteHit}
            >
              <Ionicons name={fieldIcon(type.id)} size={18} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{type.label}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{type.hint}</Text>
              </View>
            </TouchableOpacity>
          </View>
        ))}
      </View>
      {preview ? (
        <Text style={{ color: colors.muted }}>
          Forhåndsvisningen viser skjemaet slik det fylles ut. Svarene lagres ikke i malen.
        </Text>
      ) : null}
      {active && !preview ? (
        <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.bg }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Valgt felt</Text>
          <TextInput
            value={active.label}
            onChangeText={(label) => onPatch({ label })}
            placeholder="Tekst på feltet"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <TextInput
            value={active.help || ''}
            onChangeText={(help) => onPatch({ help })}
            placeholder="Hjelpetekst"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <View style={styles.row}>
            {FIELD_TYPES.map((type) => (
              <TouchableOpacity
                key={type.id}
                onPress={() => onPatch({
                  kind: type.id,
                  options: ['choice', 'checks', 'dropdown'].includes(type.id) && !(active.options || []).length
                    ? [{ id: `${active.id}_a`, label: 'Alternativ 1' }, { id: `${active.id}_b`, label: 'Alternativ 2' }]
                    : active.options,
                })}
                accessibilityRole="button"
                style={[styles.chip, { backgroundColor: active.kind === type.id ? colors.brand : colors.sunken }]}
              >
                <Text style={{ color: active.kind === type.id ? '#fff' : colors.ink }}>{type.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {active.kind !== 'title' ? (
            <TouchableOpacity
              onPress={() => onPatch({ required: !active.required })}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!active.required }}
            >
              <Text style={{ color: colors.ink }}>{active.required ? '✓' : '○'} Påkrevd</Text>
            </TouchableOpacity>
          ) : null}
          {['choice', 'checks', 'dropdown'].includes(active.kind) ? (active.options || []).map((option, optionIndex) => (
            <TextInput
              key={option.id}
              value={option.label}
              onChangeText={(label) => {
                const options = active.options.map((row, i) => (i === optionIndex ? { ...row, label } : row));
                onPatch({ options });
              }}
              placeholder={`Alternativ ${optionIndex + 1}`}
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
            />
          )) : null}
          {['choice', 'checks', 'dropdown'].includes(active.kind) ? (
            <TouchableOpacity
              onPress={() => onPatch({ options: [...(active.options || []), { id: `${active.id}_${(active.options || []).length}`, label: '' }] })}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.brand }}>Legg til alternativ</Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.row}>
            <TouchableOpacity onPress={() => onMove(-1)} accessibilityRole="button" accessibilityLabel="Flytt felt opp">
              <Text style={{ color: colors.brand }}>Opp</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onMove(1)} accessibilityRole="button" accessibilityLabel="Flytt felt ned">
              <Text style={{ color: colors.brand }}>Ned</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDuplicate} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Dupliser</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} accessibilityRole="button">
              <Text style={{ color: colors.danger }}>Slett felt</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : !preview ? (
        <Text style={{ color: colors.muted }}>Trykk et felt i skjemaet for å endre teksten.</Text>
      ) : null}
    </View>
  );
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
  const { width } = useLayout();
  const docked = width >= 980;
  const [localState, setLocalState] = useState(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState(0);
  const [note, setNote] = useState('');
  const [noteBad, setNoteBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [answers, setAnswers] = useState({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drag, setDrag] = useState(null);
  const [rootNode, setRootNode] = useState(null);
  const draftRef = useRef(null);
  const sessionRef = useRef(null);
  const listenersRef = useRef(null);
  const canvasRef = useRef(null);
  const fieldRefs = useRef([]);
  const dropRef = useRef(() => {});
  const pointerRef = useRef({ move() {}, up() {} });
  draftRef.current = draft;

  useEffect(() => {
    if (externalState) return undefined;
    let live = true;
    loadAnbudState().then((loaded) => {
      if (live) setLocalState(loaded);
    });
    return () => { live = false; };
  }, [externalState]);

  useEffect(() => () => listenersRef.current?.(), []);

  useEffect(() => {
    const el = rootNode && typeof rootNode.addEventListener === 'function' ? rootNode : null;
    if (!el) return undefined;
    const block = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    el.addEventListener('dragover', block, true);
    el.addEventListener('drop', block, true);
    return () => {
      el.removeEventListener('dragover', block, true);
      el.removeEventListener('drop', block, true);
    };
  }, [rootNode]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !drag?.active) return undefined;
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => { document.body.style.userSelect = previous; };
  }, [drag?.active]);

  const state = externalState || localState;
  const templates = state?.formTemplates || [];
  const visible = templates.filter((row) => row.title.toLocaleLowerCase('nb-NO').includes(query.trim().toLocaleLowerCase('nb-NO')));

  function say(text, bad = false) {
    setNote(text);
    setNoteBad(bad);
  }

  async function commit(result) {
    if (!result?.ok) {
      say(result?.error || 'Kunne ikke lagre skjemaet.', true);
      return;
    }
    if (externalCommit) await externalCommit(result);
    else {
      await saveAnbudState(result.state);
      setLocalState(result.state);
    }
  }

  function openTemplate(template) {
    setDraft({
      id: template.id,
      title: template.title,
      intro: template.intro || '',
      fields: template.fields.map((field) => ({ ...field, options: (field.options || []).map((row) => ({ ...row })) })),
    });
    setSelected(0);
    setPreview(false);
    setAnswers({});
    say('');
  }

  function patchField(index, patch) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    }));
  }

  dropRef.current = (payload, gap) => {
    const current = draftRef.current;
    if (!current) return;
    const target = dragTargetIndex(payload, gap, current.fields.length);
    const fields = applyDrag(current.fields, payload, target);
    setDraft({ ...current, fields });
    const raw = String(payload || '');
    if (raw.startsWith('kind:')) setSelected(Math.max(0, Math.min(target, fields.length - 1)));
    else if (raw.startsWith('move:')) {
      const from = Number(raw.slice(5));
      const land = from < gap ? gap - 1 : gap;
      setSelected(Math.max(0, Math.min(land, fields.length - 1)));
    }
  };

  function computeHover(x, y) {
    const canvas = nodeRect(canvasRef.current);
    const rects = fieldRefs.current.slice(0, draftRef.current?.fields?.length || 0).map(nodeRect);
    return insertionIndex(x, y, rects, canvas);
  }

  function stopListeners() {
    listenersRef.current?.();
    listenersRef.current = null;
  }

  function beginDrag(payload, label, onTap, event) {
    const point = pointFrom(event);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    event.preventDefault?.();
    sessionRef.current = {
      payload,
      label,
      onTap,
      startX: point.x,
      startY: point.y,
      moved: false,
    };
    setDrag({ label, x: point.x, y: point.y, active: false, hover: null });
    const move = (nativeEvent) => {
      const session = sessionRef.current;
      if (!session) return;
      const next = pointFrom(nativeEvent);
      if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) return;
      const moved = session.moved || Math.hypot(next.x - session.startX, next.y - session.startY) > 6;
      session.moved = moved;
      if (!moved) return;
      setDrag({
        label: session.label,
        x: next.x,
        y: next.y,
        active: true,
        hover: computeHover(next.x, next.y),
      });
    };
    const up = (nativeEvent) => {
      const session = sessionRef.current;
      sessionRef.current = null;
      stopListeners();
      setDrag(null);
      if (!session) return;
      if (!session.moved) {
        session.onTap?.();
        return;
      }
      const next = pointFrom(nativeEvent);
      const hover = computeHover(next.x, next.y);
      if (hover == null) return;
      dropRef.current(session.payload, hover);
    };
    pointerRef.current = { move, up };
    if (Platform.OS !== 'web' || typeof window === 'undefined' || listenersRef.current) return;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    listenersRef.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }

  function addKind(kind) {
    const current = draftRef.current;
    if (!current) return;
    const index = current.fields.length;
    setDraft({ ...current, fields: insertField(current.fields, index, kind) });
    setSelected(index);
    setPreview(false);
    if (width < 980) setPaletteOpen(false);
  }

  async function save() {
    const known = new Set((state.formTemplates || []).map((row) => row.id));
    const result = saveFormTemplate(state, draft);
    if (!result.ok) {
      say(result.error, true);
      return;
    }
    await commit(result);
    const saved = draft.id
      ? result.state.formTemplates.find((row) => row.id === draft.id)
      : result.state.formTemplates.find((row) => row.title === draft.title && !known.has(row.id));
    say('Malen er lagret på bedriften.');
    if (saved) setDraft({ ...saved, fields: saved.fields.map((field) => ({ ...field, options: (field.options || []).map((row) => ({ ...row })) })) });
  }

  function adoptForm(form, text) {
    setDraft((current) => ({
      id: current?.id && current.title ? '' : (current?.id || ''),
      title: form.title || current?.title || '',
      intro: form.intro || '',
      fields: form.fields,
    }));
    setSelected(0);
    setPreview(false);
    setAnswers({});
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

  const sidebar = draft ? (
    <FieldSidebar
      colors={colors}
      busy={busy}
      active={draft.fields[selected] || null}
      preview={preview}
      onAdd={addKind}
      onGrip={(type, event) => beginDrag(`kind:${type.id}`, type.label, () => addKind(type.id), event)}
      onScan={() => readDocument('scan')}
      onImport={() => readDocument('import')}
      onPatch={(patch) => patchField(selected, patch)}
      onDuplicate={() => {
        setDraft({ ...draft, fields: duplicateField(draft.fields, selected) });
        setSelected(selected + 1);
      }}
      onDelete={() => {
        const fields = draft.fields.filter((_, i) => i !== selected);
        setDraft({ ...draft, fields });
        setSelected(Math.max(0, selected - 1));
      }}
      onMove={(delta) => {
        const next = selected + delta;
        setDraft({ ...draft, fields: moveField(draft.fields, selected, next) });
        setSelected(Math.max(0, Math.min(next, draft.fields.length - 1)));
      }}
      docked={docked}
      onClose={docked ? null : () => setPaletteOpen(false)}
    />
  ) : null;

  return (
    <View
      ref={setRootNode}
      onPointerMove={(event) => pointerRef.current.move(event)}
      onPointerUp={(event) => pointerRef.current.up(event)}
      onPointerCancel={(event) => pointerRef.current.up(event)}
      style={[styles.root, fill && styles.fill]}
    >
      {!draft ? (
        <ScrollView style={fill ? { flex: 1 } : undefined} contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
          <Text style={[styles.h, { color: colors.ink }]}>Skjema</Text>
          <Text style={{ color: colors.muted }}>
            Bygg malene bedriften bruker. Feltene ligger i en egen sidemeny, og skjemaet vises slik det ser ut.
          </Text>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Lag mal fra dokument</Text>
            <Text style={{ color: colors.muted }}>
              AI-scan tar bilde av et papirskjema. Import leser PDF, Word, tekst eller bilde.
            </Text>
            <View style={styles.row}>
              <TouchableOpacity
                onPress={() => readDocument('scan')}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="AI-scan av skjema"
                style={[styles.btn, { backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]}
              >
                <Text style={{ color: '#fff' }}>{busy ? 'Leser dokument …' : 'AI-scan'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => readDocument('import')}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Importer dokument som mal"
                style={[styles.btn, { backgroundColor: colors.ink, opacity: busy ? 0.6 : 1 }]}
              >
                <Text style={{ color: colors.bg }}>{busy ? 'Leser dokument …' : 'Importer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Søk i skjemaene"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <TouchableOpacity
            onPress={() => { setDraft(blankForm()); setSelected(0); setPreview(false); say(''); }}
            accessibilityRole="button"
            style={[styles.btn, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]}
          >
            <Text style={{ color: '#fff' }}>Nytt skjema</Text>
          </TouchableOpacity>
          {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand }}>{note}</Text>}
          {visible.map((template) => (
            <View key={template.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <TouchableOpacity onPress={() => openTemplate(template)} accessibilityRole="button">
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{template.title}</Text>
                <Text style={{ color: colors.muted }}>{template.fields.length} felt{template.intro ? ` · ${template.intro}` : ''}</Text>
              </TouchableOpacity>
              <View style={styles.row}>
                {onPick ? (
                  <TouchableOpacity onPress={() => onPick(template.id)} accessibilityRole="button">
                    <Text style={{ color: colors.brand }}>Hent inn</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => openTemplate(template)} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>Bygg</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => commit(deleteFormTemplate(state, template.id))} accessibilityRole="button">
                  <Text style={{ color: colors.danger }}>Slett</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {!visible.length ? <Text style={{ color: colors.muted }}>Ingen skjema treffer søket.</Text> : null}
        </ScrollView>
      ) : (
        <View style={[styles.editor, fill ? styles.editorFill : styles.editorEmbed, docked && styles.editorRow]}>
          <View
            ref={canvasRef}
            collapsable={false}
            style={[styles.canvasCol, fill && styles.canvasFill]}
          >
            <ScrollView
              style={fill ? { flex: 1 } : undefined}
              contentContainerStyle={{ gap: 10, paddingBottom: 32 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={docked ? styles.toolbar : styles.toolbarPhone}>
                <TouchableOpacity onPress={() => { setDraft(null); setPaletteOpen(false); }} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>Alle skjema</Text>
                </TouchableOpacity>
                <View style={[styles.row, !docked && styles.toolbarActions]}>
                  <TouchableOpacity
                    onPress={() => setPreview((value) => !value)}
                    accessibilityRole="button"
                    accessibilityLabel={preview ? 'Tilbake til bygging' : 'Vis hvordan skjemaet ser ut'}
                    style={[styles.btn, { backgroundColor: preview ? colors.brand : colors.sunken, borderWidth: 1, borderColor: colors.line }]}
                  >
                    <Text style={{ color: preview ? '#fff' : colors.ink }}>{preview ? 'Bygg' : 'Vis skjema'}</Text>
                  </TouchableOpacity>
                  {!docked ? (
                    <TouchableOpacity
                      onPress={() => setPaletteOpen(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Åpne feltmenyen"
                      style={[styles.btn, { backgroundColor: colors.sunken, borderWidth: 1, borderColor: colors.line }]}
                    >
                      <Text style={{ color: colors.ink }}>Felt</Text>
                    </TouchableOpacity>
                  ) : null}
                  {!docked ? (
                    <TouchableOpacity onPress={() => readDocument('scan')} disabled={busy} accessibilityRole="button" accessibilityLabel="AI-scan av skjema" style={[styles.btn, { backgroundColor: colors.sunken, borderWidth: 1, borderColor: colors.line }]}>
                      <Text style={{ color: colors.ink }}>{busy ? 'Leser …' : 'AI-scan'}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {!docked ? (
                    <TouchableOpacity onPress={() => readDocument('import')} disabled={busy} accessibilityRole="button" accessibilityLabel="Importer dokument som mal" style={[styles.btn, { backgroundColor: colors.sunken, borderWidth: 1, borderColor: colors.line }]}>
                      <Text style={{ color: colors.ink }}>{busy ? 'Leser …' : 'Importer'}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity onPress={save} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
                    <Text style={{ color: '#fff' }}>Lagre mal</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TextInput
                value={draft.title}
                onChangeText={(title) => setDraft({ ...draft, title })}
                placeholder="Navn på malen"
                placeholderTextColor={colors.placeholder}
                style={[styles.titleInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
              />
              <TextInput
                value={draft.intro}
                onChangeText={(intro) => setDraft({ ...draft, intro })}
                placeholder="Kort forklaring"
                placeholderTextColor={colors.placeholder}
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
              />
              {preview && draft.intro ? <Text style={{ color: colors.muted }}>{draft.intro}</Text> : null}
              <Text style={{ color: colors.muted }}>
                {preview
                  ? 'Slik ser skjemaet ut når det fylles ut.'
                  : 'Slik ser malen ut. Dra håndtaket, så åpner skjemaet et mellomrom der feltet skal stå. Nye felt ligger i sidemenyen.'}
              </Text>
              {preview ? draft.fields.map((field) => (
                <FormAnswer
                  key={field.id}
                  field={{ ...field, value: answers[field.id] ?? field.value }}
                  colors={colors}
                  onChange={(next) => setAnswers((current) => ({ ...current, [field.id]: next }))}
                  onPickFile={() => say('Filer legges inn når malen brukes i et tilbud.')}
                />
              )) : (
                <View style={{ gap: 0 }}>
                  {draft.fields.map((field, index) => {
                    const on = index === selected;
                    return (
                      <View key={field.id}>
                        <InsertGap open={!!drag?.active} hot={drag?.hover === index} colors={colors} />
                        <View
                          ref={(node) => { fieldRefs.current[index] = node; }}
                          collapsable={false}
                          style={[
                            styles.fieldCard,
                            { borderColor: on ? colors.brand : colors.line, backgroundColor: colors.card },
                          ]}
                        >
                          <View
                            onPointerDown={(event) => {
                              if (preview) return;
                              beginDrag(
                                `move:${index}`,
                                field.label || fieldType(field.kind).label,
                                () => setSelected(index),
                                event,
                              );
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Dra ${field.label || 'feltet'}`}
                            style={[styles.grip, { backgroundColor: colors.sunken }]}
                          >
                            <Ionicons name="reorder-three" size={20} color={colors.muted} />
                          </View>
                          <TouchableOpacity
                            onPress={() => setSelected(index)}
                            accessibilityRole="button"
                            accessibilityLabel={`Velg ${field.label || 'felt'}`}
                            style={{ flex: 1 }}
                          >
                            <FormFieldFace field={field} colors={colors} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                  <InsertGap open={!!drag?.active} hot={drag?.hover === draft.fields.length} colors={colors} />
                  {!draft.fields.length ? (
                    <View style={[styles.drop, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
                      <Text style={{ color: colors.muted }}>Slipp et felt fra sidemenyen her.</Text>
                    </View>
                  ) : null}
                </View>
              )}
              {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand }}>{note}</Text>}
            </ScrollView>
          </View>
          {docked ? (
            <View
              style={[
                styles.sideCol,
                { width: 300, borderLeftColor: colors.line, backgroundColor: colors.card },
                !fill && styles.sideSticky,
              ]}
            >
              <ScrollView
                style={fill ? { flex: 1 } : { maxHeight: 720 }}
                contentContainerStyle={{ gap: 12, paddingBottom: 28 }}
                keyboardShouldPersistTaps="handled"
              >
                {sidebar}
              </ScrollView>
            </View>
          ) : null}
          {!docked && paletteOpen ? (
            <>
              <TouchableOpacity
                style={styles.scrim}
                onPress={() => setPaletteOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Lukk feltmenyen"
              />
              <View style={[styles.drawer, { backgroundColor: colors.card, borderLeftColor: colors.line }]}>
                <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
                  {sidebar}
                </ScrollView>
              </View>
            </>
          ) : null}
        </View>
      )}
      <Ghost drag={drag} colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, position: 'relative', padding: 12 },
  fill: { flex: 1, minHeight: 0 },
  h: { fontSize: 22, fontWeight: '600' },
  kicker: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  editor: { position: 'relative' },
  editorEmbed: { minHeight: 560 },
  editorFill: { flex: 1, minHeight: 0 },
  editorRow: { flexDirection: 'row', alignItems: 'stretch', gap: 16 },
  canvasCol: { flex: 1, minWidth: 0 },
  canvasFill: { flex: 1, minHeight: 0 },
  sideCol: { borderLeftWidth: 1, paddingLeft: 10, paddingRight: 4, minHeight: 0, flexShrink: 0 },
  sideSticky: Platform.OS === 'web' ? { position: 'sticky', top: 8, alignSelf: 'flex-start', maxHeight: 'calc(100vh - 96px)' } : { alignSelf: 'flex-start' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  fieldCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10, flexDirection: 'row', alignItems: 'flex-start' },
  drop: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 18, alignItems: 'center' },
  gap: { borderStyle: 'dashed', borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  toolbarPhone: { gap: 8, width: '100%' },
  toolbarActions: { width: '100%' },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  titleInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 22, fontWeight: '600' },
  paletteRow: { borderWidth: 1, borderRadius: 12, padding: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  paletteHit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingRight: 6 },
  grip: {
    width: 32,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'grab',
    touchAction: 'none',
  },
  ghost: {
    position: 'fixed',
    zIndex: 80,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 220,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 20,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '86%',
    maxWidth: 360,
    zIndex: 21,
    borderLeftWidth: 1,
    padding: 12,
  },
});
