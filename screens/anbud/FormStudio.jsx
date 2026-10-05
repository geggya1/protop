import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  FIELD_GROUPS,
  applyDrag,
  dragTargetIndex,
  duplicateField,
  fieldType,
  insertField,
  insertionIndex,
  moveField,
  responsesToCsv,
  summarizeQuestion,
} from '../../src/anbud/formBuilder';
import { fileToDataUrl } from '../../src/anbud/intakeClient';
import { pickImage } from '../../src/utils/media';
import FormAnswer from './FormAnswer';
import CompanyLogoChoice from '../../components/CompanyLogoChoice';

const PIE = ['#4285F4', '#EA4335', '#FBBC04', '#34A853', '#AB47BC', '#00ACC1', '#FF7043', '#8D6E63'];
const ICONS = {
  title: 'reader-outline',
  long: 'document-text-outline',
  text: 'create-outline',
  choice: 'radio-button-on-outline',
  checks: 'checkbox-outline',
  dropdown: 'chevron-down-circle-outline',
  scale: 'options-outline',
  date: 'calendar-outline',
  time: 'time-outline',
  number: 'calculator-outline',
  check: 'checkmark-circle-outline',
  image: 'image-outline',
  file: 'document-attach-outline',
};

const SETTINGS = [
  ['Generelt', [
    ['collectEmail', 'Samle e-postadresser', 'Be om e-post før svaret sendes.'],
    ['requireLogin', 'Krever innlogging', 'Respondenten må være logget inn.'],
    ['allowEdit', 'Svar kan endres', 'Svaret kan endres etter at det er sendt.'],
    ['showSummary', 'Se resultatsammendrag', 'Den som svarer kan se sammendraget.'],
  ]],
  ['Varsler', [
    ['pushAlerts', 'Push-varsler', 'Varsle når et nytt svar kommer inn.'],
    ['emailAlerts', 'E-postvarsler', 'Send e-post når et nytt svar kommer inn.'],
  ]],
  ['Presentasjon', [
    ['progress', 'Vis fremdriftslinje', 'Vis hvor langt respondenten er kommet.'],
    ['shuffleQuestions', 'Bland spørsmålsrekkefølgen', 'Spørsmålene bytter plass for hvert svar.'],
    ['anotherResponse', 'Send inn et annet svar', 'Vis en lenke for å svare en gang til.'],
    ['useCompanyLogo', 'Bruk bedriftens logo', 'Viser logoen fra bedriftsinnstillingene. ProTop-logoen beholdes.'],
  ]],
];

function pointFrom(event) {
  const source = event?.nativeEvent || event || {};
  return { x: Number(source.clientX ?? source.pageX), y: Number(source.clientY ?? source.pageY) };
}

function nodeRect(node) {
  if (!node || typeof node.getBoundingClientRect !== 'function') return null;
  const rect = node.getBoundingClientRect();
  return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, height: rect.height };
}

function arcPath(cx, cy, r, start, end) {
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

function mixRows(list, seed) {
  const rows = list.slice();
  let n = seed || 1;
  for (let i = rows.length - 1; i > 0; i -= 1) {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    const j = n % (i + 1);
    const held = rows[i];
    rows[i] = rows[j];
    rows[j] = held;
  }
  return rows;
}

function Ghost({ drag, colors }) {
  if (!drag?.active || !Number.isFinite(drag.x) || !Number.isFinite(drag.y)) return null;
  const node = (
    <View pointerEvents="none" style={[styles.ghost, { left: drag.x + 12, top: drag.y + 12, backgroundColor: colors.card, borderColor: colors.brand }]}>
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

function PieChart({ counts, colors }) {
  const total = counts.reduce((sum, row) => sum + row.count, 0);
  if (!total) return null;
  let angle = -Math.PI / 2;
  const decorated = counts.map((part, index) => {
    const sweep = (part.count / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    return { ...part, start, end: angle, color: PIE[index % PIE.length] };
  });
  const slices = decorated.filter((part) => part.count > 0);
  return (
    <View style={styles.pieRow}>
      <Svg width={148} height={148}>
        {slices.length === 1 ? <Circle cx={74} cy={74} r={64} fill={slices[0].color} /> : slices.map((slice) => (
          <Path key={slice.id} d={arcPath(74, 74, 64, slice.start, slice.end)} fill={slice.color} />
        ))}
      </Svg>
      <View style={{ gap: 6, flex: 1 }}>
        {decorated.map((slice) => (
          <Text key={slice.id} style={{ color: colors.ink }}>
            {slice.label} · {Math.round((slice.count / total) * 1000) / 10}%
          </Text>
        ))}
      </View>
    </View>
  );
}

function answered(field, value) {
  if (field.kind === 'check') return value === true;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return !!value.name;
  return String(value || '').trim().length > 0;
}

export default function FormStudio({
  draft,
  colors,
  busy,
  note,
  noteBad,
  fill,
  onDraft,
  onBack,
  onSave,
  onScan,
  onImport,
  companyLogo = null,
}) {
  const [tab, setTab] = useState('questions');
  const [selected, setSelected] = useState(0);
  const [typeOpen, setTypeOpen] = useState(false);
  const [typeFor, setTypeFor] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [answers, setAnswers] = useState({});
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [sendNote, setSendNote] = useState('');
  const [responseTab, setResponseTab] = useState('summary');
  const [person, setPerson] = useState(0);
  const [drag, setDrag] = useState(null);
  const [imageNote, setImageNote] = useState('');
  const [previewSeed, setPreviewSeed] = useState(1);
  const [rootNode, setRootNode] = useState(null);
  const sessionRef = useRef(null);
  const listenersRef = useRef(null);
  const canvasRef = useRef(null);
  const fieldRefs = useRef([]);
  const pointerRef = useRef({ move() {}, up() {} });
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const settings = draft.settings || {};
  const responses = draft.responses || [];

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

  function patch(index, part) {
    onDraft({
      ...draft,
      fields: draft.fields.map((field, i) => (i === index ? { ...field, ...part } : field)),
    });
  }

  function addKind(kind, at) {
    const index = at == null ? draft.fields.length : at;
    onDraft({ ...draft, fields: insertField(draft.fields, index, kind) });
    setSelected(index);
    setTypeOpen(false);
    setTab('questions');
  }

  function chooseType(kind) {
    if (typeFor == null) {
      addKind(kind, Math.min(selected + 1, draft.fields.length));
      return;
    }
    const current = draft.fields[typeFor];
    if (!current) {
      setTypeOpen(false);
      return;
    }
    const optionKind = ['choice', 'checks', 'dropdown'].includes(kind);
    const options = optionKind
      ? ((current.options || []).length
        ? current.options
        : [{ id: `${current.id}_a`, label: 'Alternativ 1' }, { id: `${current.id}_b`, label: 'Alternativ 2' }])
      : [];
    patch(typeFor, {
      kind,
      options,
      other: optionKind && kind !== 'dropdown' ? !!current.other : false,
      shuffle: optionKind ? !!current.shuffle : false,
    });
    setTypeOpen(false);
  }

  function openTab(id) {
    if (id === 'preview') setPreviewSeed((Date.now() % 100000) || 1);
    setTab(id);
  }

  async function setCover() {
    const picked = await pickImage({ edit: false });
    if (!picked) return;
    const dataUrl = await fileToDataUrl(picked);
    if (!dataUrl || !dataUrl.startsWith('data:image/') || dataUrl.length > 500000) {
      setImageNote(dataUrl ? 'Forsidebildet er for stort.' : 'Kunne ikke lese bildet.');
      return;
    }
    setImageNote('');
    onDraft({ ...draft, cover: dataUrl });
  }

  async function setOptionImage(index, optionIndex) {
    const picked = await pickImage({ edit: false });
    if (!picked) return;
    const dataUrl = await fileToDataUrl(picked);
    if (!dataUrl || !dataUrl.startsWith('data:image/') || dataUrl.length > 180000) {
      setImageNote(dataUrl ? 'Alternativbildet er for stort.' : 'Kunne ikke lese bildet.');
      return;
    }
    setImageNote('');
    const field = draft.fields[index];
    patch(index, {
      options: field.options.map((row, i) => (i === optionIndex ? { ...row, image: dataUrl } : row)),
    });
  }

  function submit() {
    if (settings.requireLogin) {
      setSendNote('Innlogging kreves før svaret kan sendes.');
      return;
    }
    const fields = draft.fields.filter((field) => field.kind !== 'title');
    const missing = fields.find((field) => field.required && !answered(field, answers[field.id]));
    if (settings.collectEmail && !email.includes('@')) {
      setSendNote('Skriv inn e-postadressen.');
      return;
    }
    if (missing) {
      setSendNote(`«${missing.label}» må fylles ut.`);
      return;
    }
    const response = {
      id: `svar_${Date.now().toString(36)}`,
      at: new Date().toISOString(),
      email,
      answers: { ...answers },
    };
    onDraft({ ...draft, responses: [...responses, response].slice(-40) });
    setSent(true);
    setSendNote('');
    if (!settings.anotherResponse) setAnswers({});
  }

  function exportCsv() {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const csv = `\uFEFF${responsesToCsv(draft)}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${draft.title || 'skjema'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function beginDrag(index, event) {
    const point = pointFrom(event);
    if (!Number.isFinite(point.x)) return;
    event.preventDefault?.();
    listenersRef.current?.();
    listenersRef.current = null;
    const label = draft.fields[index]?.label || 'Felt';
    sessionRef.current = { from: index, label, startX: point.x, startY: point.y, moved: false };
    setDrag({ label, x: point.x, y: point.y, active: false, hover: null });
    const move = (nativeEvent) => {
      const session = sessionRef.current;
      if (!session) return;
      const next = pointFrom(nativeEvent);
      const moved = session.moved || Math.hypot(next.x - session.startX, next.y - session.startY) > 6;
      session.moved = moved;
      if (!moved) return;
      const canvas = nodeRect(canvasRef.current);
      const rects = fieldRefs.current.slice(0, draftRef.current.fields.length).map(nodeRect);
      setDrag({ label: session.label, x: next.x, y: next.y, active: true, hover: insertionIndex(next.x, next.y, rects, canvas) });
    };
    const up = (nativeEvent) => {
      const session = sessionRef.current;
      sessionRef.current = null;
      listenersRef.current?.();
      listenersRef.current = null;
      setDrag(null);
      if (!session?.moved) return;
      const next = pointFrom(nativeEvent);
      const canvas = nodeRect(canvasRef.current);
      const rects = fieldRefs.current.slice(0, draftRef.current.fields.length).map(nodeRect);
      const hover = insertionIndex(next.x, next.y, rects, canvas);
      if (hover == null) return;
      const current = draftRef.current;
      const target = dragTargetIndex(`move:${session.from}`, hover, current.fields.length);
      onDraft({ ...current, fields: applyDrag(current.fields, `move:${session.from}`, target) });
      const land = session.from < hover ? hover - 1 : hover;
      setSelected(Math.max(0, Math.min(land, current.fields.length - 1)));
    };
    pointerRef.current = { move, up };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      listenersRef.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
    }
  }

  const previewFields = settings.shuffleQuestions
    ? mixRows(draft.fields, previewSeed)
    : draft.fields;

  function optionsFor(field) {
    if (!field.shuffle || !(field.options || []).length) return field.options || [];
    return mixRows(field.options, previewSeed + String(field.id).length);
  }

  const required = draft.fields.filter((field) => field.required);
  const done = required.filter((field) => answered(field, answers[field.id])).length;
  const progress = required.length ? done / required.length : 1;
  const activePerson = responses[person] || null;

  return (
    <View
      ref={setRootNode}
      onPointerMove={(event) => pointerRef.current.move(event)}
      onPointerUp={(event) => pointerRef.current.up(event)}
      onPointerCancel={(event) => pointerRef.current.up(event)}
      style={[styles.fill, fill && { flex: 1, minHeight: 0 }]}
    >
      <View ref={canvasRef} style={{ flex: 1, minHeight: 0 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.center}>
            <View style={styles.topRow}>
              <TouchableOpacity onPress={onBack} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Alle skjema</Text>
              </TouchableOpacity>
              <View style={styles.row}>
                <TouchableOpacity onPress={onScan} disabled={busy} accessibilityRole="button" accessibilityLabel="AI-scan">
                  <Text style={{ color: colors.brand }}>{busy ? 'Leser …' : 'AI-scan'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onImport} disabled={busy} accessibilityRole="button" accessibilityLabel="Importer">
                  <Text style={{ color: colors.brand }}>Importer</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSettingsOpen(true)} accessibilityRole="button" accessibilityLabel="Innstillinger">
                  <Ionicons name="settings-outline" size={20} color={colors.ink} />
                </TouchableOpacity>
                <TouchableOpacity onPress={onSave} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
                  <Text style={{ color: '#fff' }}>Lagre</Text>
                </TouchableOpacity>
              </View>
            </View>
            {tab === 'questions' ? (
              <>
                <CompanyLogoChoice
                  value={!!settings.useCompanyLogo}
                  onChange={(useCompanyLogo) => onDraft({ ...draft, settings: { ...settings, useCompanyLogo } })}
                  logo={companyLogo}
                  colors={colors}
                  subject="skjemaet"
                />
                <TouchableOpacity onPress={setCover} accessibilityRole="button" style={[styles.cover, { backgroundColor: colors.card, borderColor: colors.line }]}>
                  {draft.cover ? <Image source={{ uri: draft.cover }} style={styles.coverImage} /> : (
                    <Text style={{ color: colors.muted }}>Legg til forsidebilde</Text>
                  )}
                </TouchableOpacity>
                <View style={[styles.card, styles.headerCard, { backgroundColor: colors.card, borderColor: colors.line, borderTopColor: colors.brand }]}>
                  <TextInput
                    value={draft.title}
                    onChangeText={(title) => onDraft({ ...draft, title })}
                    placeholder="Navn på skjemaet"
                    placeholderTextColor={colors.placeholder}
                    style={[styles.title, { color: colors.ink }]}
                  />
                  <TextInput
                    value={draft.intro}
                    onChangeText={(intro) => onDraft({ ...draft, intro })}
                    placeholder="Beskrivelse"
                    placeholderTextColor={colors.placeholder}
                    multiline
                    style={[styles.intro, { color: colors.ink }]}
                  />
                </View>
                {draft.fields.map((field, index) => {
                  const on = index === selected;
                  const meta = fieldType(field.kind);
                  return (
                    <View key={field.id}>
                      <View style={[styles.gap, { height: drag?.active && drag.hover === index ? 64 : 0, borderWidth: drag?.active && drag.hover === index ? 1 : 0, backgroundColor: colors.brandSoft, borderColor: colors.brand }]}>
                        {drag?.hover === index ? <Text style={{ color: colors.brand, fontWeight: '600' }}>Slipp feltet her</Text> : null}
                      </View>
                      <View
                        ref={(node) => { fieldRefs.current[index] = node; }}
                        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line, borderLeftColor: on ? colors.brand : colors.line, borderLeftWidth: on ? 4 : 1 }]}
                      >
                        <View style={styles.questionHead}>
                          <View
                            onPointerDown={(event) => beginDrag(index, event)}
                            accessibilityRole="button"
                            accessibilityLabel={`Dra ${field.label || 'felt'}`}
                            style={[styles.grip, { backgroundColor: colors.sunken }]}
                          >
                            <Ionicons name="reorder-three" size={18} color={colors.muted} />
                          </View>
                          {on && field.kind !== 'title' ? (
                            <TextInput
                              value={field.label}
                              onChangeText={(label) => patch(index, { label })}
                              placeholder="Spørsmål"
                              placeholderTextColor={colors.placeholder}
                              style={[styles.questionInput, { color: colors.ink, borderColor: colors.line }]}
                            />
                          ) : (
                            <TouchableOpacity onPress={() => setSelected(index)} style={{ flex: 1 }} accessibilityRole="button">
                              <Text style={{ color: colors.ink, fontWeight: '600', fontSize: field.kind === 'title' ? 20 : 16 }}>{field.label || 'Spørsmål'}</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            onPress={() => { setTypeFor(index); setTypeOpen(true); setSelected(index); }}
                            accessibilityRole="button"
                            accessibilityLabel="Velg spørsmålstype"
                            style={[styles.typeChip, { backgroundColor: colors.sunken }]}
                          >
                            <Ionicons name={ICONS[field.kind] || 'ellipse-outline'} size={16} color={colors.brand} />
                            <Text style={{ color: colors.ink }}>{meta.label}</Text>
                          </TouchableOpacity>
                        </View>
                        {on && field.kind === 'title' ? (
                          <TextInput
                            value={field.label}
                            onChangeText={(label) => patch(index, { label })}
                            placeholder="Seksjon"
                            placeholderTextColor={colors.placeholder}
                            style={[styles.questionInput, { color: colors.ink, borderColor: colors.line }]}
                          />
                        ) : null}
                        {on && ['choice', 'checks', 'dropdown'].includes(field.kind) ? (
                          <View style={{ gap: 8 }}>
                            {(field.options || []).map((option, optionIndex) => (
                              <View key={option.id} style={styles.optionRow}>
                                <Ionicons name={field.kind === 'checks' ? 'square-outline' : field.kind === 'dropdown' ? 'chevron-down' : 'ellipse-outline'} size={16} color={colors.muted} />
                                <TextInput
                                  value={option.label}
                                  onChangeText={(label) => patch(index, { options: field.options.map((row, i) => (i === optionIndex ? { ...row, label } : row)) })}
                                  placeholder={`Alternativ ${optionIndex + 1}`}
                                  placeholderTextColor={colors.placeholder}
                                  style={[styles.optionInput, { color: colors.ink, borderBottomColor: colors.line }]}
                                />
                                {option.image ? <Image source={{ uri: option.image }} style={styles.optionImage} /> : null}
                                <TouchableOpacity onPress={() => setOptionImage(index, optionIndex)} accessibilityRole="button" accessibilityLabel="Bilde på alternativ">
                                  <Ionicons name="image-outline" size={18} color={colors.brand} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => patch(index, { options: field.options.filter((_, i) => i !== optionIndex) })} accessibilityRole="button" accessibilityLabel="Fjern alternativ">
                                  <Ionicons name="remove-circle-outline" size={18} color={colors.danger} />
                                </TouchableOpacity>
                              </View>
                            ))}
                            {field.other ? <Text style={{ color: colors.muted }}>Annet…</Text> : null}
                            <View style={styles.row}>
                              <TouchableOpacity onPress={() => patch(index, { options: [...(field.options || []), { id: `${field.id}_${(field.options || []).length}`, label: '' }] })} accessibilityRole="button">
                                <Text style={{ color: colors.brand }}>Legg til alternativ</Text>
                              </TouchableOpacity>
                              {field.kind !== 'dropdown' ? (
                                <TouchableOpacity onPress={() => patch(index, { other: !field.other })} accessibilityRole="button">
                                  <Text style={{ color: colors.brand }}>{field.other ? 'Fjern Annet' : 'eller legg til Annet'}</Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                        ) : null}
                        {on && field.kind === 'scale' ? (
                          <View style={{ gap: 8 }}>
                            <Text style={{ color: colors.muted }}>Skala 1–{field.scaleMax || 5}</Text>
                            <View style={styles.row}>
                              {[3, 5, 7, 10].map((n) => (
                                <TouchableOpacity key={n} onPress={() => patch(index, { scaleMax: n })} accessibilityRole="button" style={[styles.scaleN, { backgroundColor: field.scaleMax === n ? colors.brand : colors.sunken }]}>
                                  <Text style={{ color: field.scaleMax === n ? '#fff' : colors.ink }}>{n}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            <TextInput value={field.lowLabel || ''} onChangeText={(lowLabel) => patch(index, { lowLabel })} placeholder="Etikett for 1" placeholderTextColor={colors.placeholder} style={[styles.optionInput, { color: colors.ink, borderBottomColor: colors.line }]} />
                            <TextInput value={field.highLabel || ''} onChangeText={(highLabel) => patch(index, { highLabel })} placeholder="Etikett for høyeste" placeholderTextColor={colors.placeholder} style={[styles.optionInput, { color: colors.ink, borderBottomColor: colors.line }]} />
                          </View>
                        ) : null}
                        {on ? (
                          <View style={[styles.cardFoot, { borderTopColor: colors.line }]}>
                            {field.kind !== 'title' ? (
                              <View style={styles.switchRow}>
                                <Text style={{ color: colors.ink }}>Obligatorisk</Text>
                                <Switch value={!!field.required} onValueChange={(required) => patch(index, { required })} />
                              </View>
                            ) : null}
                            {['choice', 'checks', 'dropdown'].includes(field.kind) ? (
                              <View style={styles.switchRow}>
                                <Text style={{ color: colors.ink }}>Tilfeldig rekkefølge</Text>
                                <Switch value={!!field.shuffle} onValueChange={(shuffle) => patch(index, { shuffle })} />
                              </View>
                            ) : null}
                            <View style={styles.row}>
                              <TouchableOpacity onPress={() => { onDraft({ ...draft, fields: duplicateField(draft.fields, index) }); setSelected(index + 1); }} accessibilityRole="button" accessibilityLabel="Kopier spørsmål">
                                <Ionicons name="copy-outline" size={18} color={colors.muted} />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => { onDraft({ ...draft, fields: moveField(draft.fields, index, index - 1) }); setSelected(Math.max(0, index - 1)); }} accessibilityRole="button" accessibilityLabel="Flytt opp">
                                <Ionicons name="arrow-up" size={18} color={colors.muted} />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => { onDraft({ ...draft, fields: moveField(draft.fields, index, index + 1) }); setSelected(Math.min(draft.fields.length - 1, index + 1)); }} accessibilityRole="button" accessibilityLabel="Flytt ned">
                                <Ionicons name="arrow-down" size={18} color={colors.muted} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => {
                                  const fields = draft.fields.filter((_, i) => i !== index);
                                  onDraft({ ...draft, fields });
                                  setSelected(Math.max(0, index - 1));
                                }}
                                accessibilityRole="button"
                                accessibilityLabel="Slett spørsmål"
                              >
                                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
                <View style={[styles.gap, { height: drag?.active && drag.hover === draft.fields.length ? 64 : 0, borderWidth: drag?.active && drag.hover === draft.fields.length ? 1 : 0, backgroundColor: colors.brandSoft, borderColor: colors.brand }]}>
                  {drag?.hover === draft.fields.length ? <Text style={{ color: colors.brand, fontWeight: '600' }}>Slipp feltet her</Text> : null}
                </View>
              </>
            ) : null}
            {tab === 'preview' ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line, gap: 12 }]}>
                {settings.useCompanyLogo && companyLogo?.dataUrl ? (
                  <Image source={{ uri: companyLogo.dataUrl }} style={styles.logo} resizeMode="contain" accessibilityLabel="Bedriftens logo" />
                ) : null}
                {settings.useCompanyLogo && !companyLogo?.dataUrl ? (
                  <Text style={{ color: colors.muted }}>Bedriftens logo er valgt, men ikke lastet opp ennå.</Text>
                ) : null}
                {draft.cover ? <Image source={{ uri: draft.cover }} style={styles.coverImage} /> : null}
                <Text style={[styles.title, { color: colors.ink }]}>{draft.title || 'Uten navn'}</Text>
                {draft.intro ? <Text style={{ color: colors.muted }}>{draft.intro}</Text> : null}
                {settings.progress ? (
                  <View style={[styles.track, { backgroundColor: colors.sunken }]}>
                    <View style={[styles.bar, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.brand }]} />
                  </View>
                ) : null}
                {settings.requireLogin ? <Text style={{ color: colors.muted }}>Innlogging kreves for å sende inn.</Text> : null}
                {settings.collectEmail ? (
                  <TextInput value={email} onChangeText={setEmail} placeholder="E-post" placeholderTextColor={colors.placeholder} autoCapitalize="none" keyboardType="email-address" style={[styles.questionInput, { color: colors.ink, borderColor: colors.line }]} />
                ) : null}
                {previewFields.map((field) => (
                  <FormAnswer
                    key={field.id}
                    field={{
                      ...field,
                      options: optionsFor(field),
                      value: answers[field.id] ?? (field.kind === 'check' ? false : field.kind === 'checks' ? [] : ''),
                    }}
                    colors={colors}
                    onChange={(next) => setAnswers((current) => ({ ...current, [field.id]: next }))}
                    onPickFile={() => setAnswers((current) => ({ ...current, [field.id]: { name: field.kind === 'image' ? 'bilde.jpg' : 'fil.pdf' } }))}
                  />
                ))}
                {sent ? <Text style={{ color: colors.brand }}>{settings.confirmation || 'Svaret er sendt.'}</Text> : null}
                {!!sendNote && <Text style={{ color: colors.danger }}>{sendNote}</Text>}
                <View style={styles.row}>
                  <TouchableOpacity onPress={submit} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
                    <Text style={{ color: '#fff' }}>Send inn</Text>
                  </TouchableOpacity>
                  {sent && settings.anotherResponse ? (
                    <TouchableOpacity onPress={() => { setSent(false); setAnswers({}); setEmail(''); }} accessibilityRole="button">
                      <Text style={{ color: colors.brand }}>Send et annet svar</Text>
                    </TouchableOpacity>
                  ) : null}
                  {sent && settings.showSummary ? (
                    <TouchableOpacity onPress={() => openTab('responses')} accessibilityRole="button">
                      <Text style={{ color: colors.brand }}>Se sammendrag</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : null}
            {tab === 'responses' ? (
              <View style={{ gap: 12 }}>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
                  <TouchableOpacity onPress={exportCsv} accessibilityRole="button" style={styles.menuRow}>
                    <Ionicons name="download-outline" size={18} color={colors.ink} />
                    <Text style={{ color: colors.ink }}>Eksporter til CSV</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { if (typeof window !== 'undefined') window.print(); }} accessibilityRole="button" style={styles.menuRow}>
                    <Ionicons name="print-outline" size={18} color={colors.ink} />
                    <Text style={{ color: colors.ink }}>Skriv ut</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onDraft({ ...draft, responses: [] })} accessibilityRole="button" style={styles.menuRow}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    <Text style={{ color: colors.danger }}>Slette alle</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.row}>
                  {[['summary', 'Sammendrag'], ['question', 'Spørsmål'], ['person', 'Individuell']].map(([id, label]) => (
                    <TouchableOpacity key={id} onPress={() => setResponseTab(id)} accessibilityRole="button" style={[styles.typeChip, { backgroundColor: responseTab === id ? colors.brand : colors.sunken }]}>
                      <Text style={{ color: responseTab === id ? '#fff' : colors.ink }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={{ color: colors.muted }}>{responses.length} svar</Text>
                {responseTab === 'person' && !responses.length ? <Text style={{ color: colors.muted }}>Ingen svar ennå.</Text> : null}
                {responseTab === 'person' && activePerson ? (
                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line, gap: 8 }]}>
                    <View style={styles.row}>
                      <TouchableOpacity onPress={() => setPerson(Math.max(0, person - 1))} accessibilityRole="button"><Text style={{ color: colors.brand }}>Forrige</Text></TouchableOpacity>
                      <Text style={{ color: colors.muted }}>{person + 1} / {responses.length}</Text>
                      <TouchableOpacity onPress={() => setPerson(Math.min(responses.length - 1, person + 1))} accessibilityRole="button"><Text style={{ color: colors.brand }}>Neste</Text></TouchableOpacity>
                    </View>
                    {activePerson.email ? <Text style={{ color: colors.ink }}>{activePerson.email}</Text> : null}
                    {draft.fields.filter((field) => field.kind !== 'title').map((field) => (
                      <View key={field.id}>
                        <Text style={{ color: colors.muted }}>{field.label}</Text>
                        <Text style={{ color: colors.ink }}>{displayAnswer(field, activePerson.answers?.[field.id]) || '—'}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {responseTab !== 'person' ? draft.fields.filter((field) => field.kind !== 'title').map((field) => {
                  const summary = summarizeQuestion(field, responses);
                  return (
                    <View key={field.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line, gap: 8 }]}>
                      <Text style={{ color: colors.ink, fontWeight: '600' }}>{field.label}</Text>
                      <Text style={{ color: colors.muted }}>{summary.answered} svar</Text>
                      {summary.counts && summary.answered ? <PieChart counts={summary.counts} colors={colors} /> : null}
                      {field.kind === 'scale' && summary.answered ? <Text style={{ color: colors.ink }}>Snitt {summary.average}</Text> : null}
                      {(summary.texts || []).map((line) => <Text key={line} style={{ color: colors.ink }}>{line}</Text>)}
                      {!summary.answered ? <Text style={{ color: colors.muted }}>Ingen svar ennå på dette spørsmålet.</Text> : null}
                    </View>
                  );
                }) : null}
              </View>
            ) : null}
            {!!imageNote && <Text style={{ color: colors.danger }}>{imageNote}</Text>}
            {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand }}>{note}</Text>}
          </View>
        </ScrollView>
      </View>
      {tab === 'questions' ? (
        <TouchableOpacity
          onPress={() => { setTypeFor(null); setTypeOpen(true); }}
          accessibilityRole="button"
          accessibilityLabel="Nytt spørsmål"
          style={[styles.fab, { backgroundColor: colors.brand }]}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      ) : null}
      <View style={[styles.tabs, { backgroundColor: colors.card, borderTopColor: colors.line }]}>
        {[
          ['questions', 'Spørsmål', 'list-outline'],
          ['preview', 'Forhåndsvisning', 'eye-outline'],
          ['responses', 'Svar', 'pie-chart-outline'],
        ].map(([id, label, icon]) => (
          <TouchableOpacity key={id} onPress={() => openTab(id)} accessibilityRole="button" style={styles.tab}>
            <Ionicons name={icon} size={18} color={tab === id ? colors.brand : colors.muted} />
            <Text style={{ color: tab === id ? colors.brand : colors.muted, fontSize: 12 }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {typeOpen ? (
        <View style={styles.sheetWrap}>
          <TouchableOpacity style={styles.scrim} onPress={() => setTypeOpen(false)} accessibilityRole="button" accessibilityLabel="Lukk" />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Velg spørsmålstype</Text>
            <ScrollView>
              {FIELD_GROUPS.map((group) => (
                <View key={group.id} style={{ gap: 4, marginBottom: 12 }}>
                  <Text style={[styles.kicker, { color: colors.muted }]}>{group.label}</Text>
                  {group.types.map((id) => {
                    const meta = fieldType(id);
                    return (
                      <TouchableOpacity key={id} onPress={() => chooseType(id)} accessibilityRole="button" style={styles.menuRow}>
                        <Ionicons name={ICONS[id]} size={18} color={colors.brand} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.ink }}>{meta.label}</Text>
                          <Text style={{ color: colors.muted, fontSize: 12 }}>{meta.hint}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      ) : null}
      {settingsOpen ? (
        <View style={styles.sheetWrap}>
          <TouchableOpacity style={styles.scrim} onPress={() => setSettingsOpen(false)} accessibilityRole="button" accessibilityLabel="Lukk innstillinger" />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Innstillinger</Text>
            <ScrollView>
              {SETTINGS.map(([title, rows]) => (
                <View key={title} style={{ gap: 8, marginBottom: 16 }}>
                  <Text style={[styles.kicker, { color: colors.muted }]}>{title}</Text>
                  {rows.map(([key, label, help]) => (
                    <View key={key} style={styles.switchRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.ink }}>{label}</Text>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>{help}</Text>
                      </View>
                      <Switch value={!!settings[key]} onValueChange={(value) => onDraft({ ...draft, settings: { ...settings, [key]: value } })} />
                    </View>
                  ))}
                </View>
              ))}
              <Text style={[styles.kicker, { color: colors.muted }]}>Bekreftelsesmelding</Text>
              <TextInput
                value={settings.confirmation || ''}
                onChangeText={(confirmation) => onDraft({ ...draft, settings: { ...settings, confirmation } })}
                placeholder="Svaret er sendt."
                placeholderTextColor={colors.placeholder}
                style={[styles.questionInput, { color: colors.ink, borderColor: colors.line }]}
              />
            </ScrollView>
          </View>
        </View>
      ) : null}
      <Ghost drag={drag} colors={colors} />
    </View>
  );
}

function displayAnswer(field, value) {
  if (value == null || value === '') return '';
  if (field.kind === 'check') return value ? 'Ja' : 'Nei';
  if (Array.isArray(value)) {
    return value.map((id) => {
      if (String(id).startsWith('other:')) return String(id).slice(6) || 'Annet';
      return (field.options || []).find((row) => row.id === id)?.label || id;
    }).join(', ');
  }
  if (typeof value === 'object') return value.name || '';
  if (String(value).startsWith('other:')) return String(value).slice(6) || 'Annet';
  return (field.options || []).find((row) => row.id === value)?.label || String(value);
}

const styles = StyleSheet.create({
  fill: { position: 'relative', minHeight: 560 },
  scroll: { padding: 12, paddingBottom: 96 },
  center: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 12 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  save: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  cover: { minHeight: 92, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  coverImage: { width: '100%', height: 160 },
  logo: { width: 180, height: 56, alignSelf: 'flex-start' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  headerCard: { borderTopWidth: 4 },
  title: { fontSize: 26, fontWeight: '600' },
  intro: { fontSize: 16, minHeight: 48 },
  questionHead: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  questionInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionInput: { flex: 1, borderBottomWidth: 1, paddingVertical: 6, fontSize: 16 },
  optionImage: { width: 28, height: 28, borderRadius: 6 },
  cardFoot: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  grip: { width: 28, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none' },
  gap: { borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fab: { position: 'absolute', right: 18, bottom: 74, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  sheetWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { maxHeight: '78%', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, gap: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  kicker: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  pieRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  track: { height: 8, borderRadius: 99, overflow: 'hidden' },
  bar: { height: 8 },
  scaleN: { minWidth: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  ghost: { position: 'fixed', zIndex: 30, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
});
