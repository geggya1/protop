import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  FIELD_TYPES,
  FORM_MODULES,
  applyDrag,
  dragTargetIndex,
  duplicateField,
  fieldType,
  insertModule,
  insertionIndex,
  moveField,
  responsesToCsv,
  summarizeQuestion,
} from '../../src/anbud/formBuilder';
import { fileToDataUrl } from '../../src/anbud/intakeClient';
import { pickImage } from '../../src/utils/media';

/** A4 ved 96 dpi. Word-mal: marg 2,5 cm, Calibri 11 pkt, linjeavstand 1,15, 8 pkt etter avsnitt. */
const PAGE_W = 794;
const PAGE_H = 1123;
const MARGIN = 94;
const BODY = 15;
const LEADING = 17;
const AFTER = 11;
const FONT = 'Calibri, "Segoe UI", Arial, sans-serif';
const INK = '#1a1a1a';
const PAPER = '#ffffff';
const QUIET = '#5c5c5c';
const HAIR = '#1a1a1a';
const PIE = ['#1a1a1a', '#4b5563', '#9ca3af', '#d97706', '#1d4ed8', '#047857', '#b91c1c', '#6d28d9'];

const RAIL = [
  ['modules', 'Moduler'],
  ['preview', 'Utseende'],
  ['responses', 'Svar'],
  ['settings', 'Innstillinger'],
];

const ICONS = {
  brevhode: 'business-outline',
  mottaker: 'mail-outline',
  oppdragsgiver: 'briefcase-outline',
  kontakt: 'person-outline',
  befaring: 'map-outline',
  pris: 'cash-outline',
  sjekkliste: 'checkbox-outline',
  signatur: 'create-outline',
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
  ]],
];

const PAGE_SPEC = [
  ['Format', 'A4, 210 × 297 mm'],
  ['Marger', '2,5 cm på alle sider'],
  ['Skrift', 'Calibri 11 pkt'],
  ['Linjeavstand', '1,15'],
  ['Etter avsnitt', '8 pkt'],
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

function answered(field, value) {
  if (field.kind === 'check') return value === true;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return !!value.name;
  return String(value || '').trim().length > 0;
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

function Ghost({ drag }) {
  if (!drag?.active || !Number.isFinite(drag.x) || !Number.isFinite(drag.y)) return null;
  const node = (
    <View pointerEvents="none" style={[styles.ghost, { left: drag.x + 12, top: drag.y + 12 }]}>
      <Text style={styles.ghostText}>{drag.label}</Text>
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

function PieChart({ counts }) {
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
      <Svg width={132} height={132}>
        {slices.length === 1 ? <Circle cx={66} cy={66} r={58} fill={slices[0].color} /> : slices.map((slice) => (
          <Path key={slice.id} d={arcPath(66, 66, 58, slice.start, slice.end)} fill={slice.color} />
        ))}
      </Svg>
      <View style={{ gap: 2, flex: 1 }}>
        {decorated.map((slice) => (
          <Text key={slice.id} style={styles.docBody}>
            {slice.label} · {Math.round((slice.count / total) * 1000) / 10}%
          </Text>
        ))}
      </View>
    </View>
  );
}

function PaperField({
  field,
  preview,
  selected,
  showGrip,
  value,
  onSelect,
  onPatch,
  onAnswer,
  onDrag,
  onOptionImage,
}) {
  const editing = selected && !preview;
  const label = `${field.label || 'Spørsmål'}${field.required ? ' *' : ''}`;
  const many = field.kind === 'checks';
  const picked = many ? (Array.isArray(value) ? value : []) : value;

  function Bullet({ on = false, box = false }) {
    return <View style={[styles.bullet, box && styles.bulletBox, on && styles.bulletOn]} />;
  }

  let body = null;
  if (field.kind === 'title') {
    body = editing ? (
      <TextInput
        value={field.label}
        onChangeText={(next) => onPatch({ label: next })}
        placeholder="Seksjon"
        placeholderTextColor="#8a8a8a"
        style={styles.docHeadingInput}
      />
    ) : (
      <Text style={styles.docHeading}>{field.label || 'Seksjon'}</Text>
    );
  } else if (field.kind === 'choice' || field.kind === 'checks' || field.kind === 'dropdown') {
    body = (
      <View>
        {editing ? (
          <TextInput value={field.label} onChangeText={(next) => onPatch({ label: next })} placeholder="Spørsmål" placeholderTextColor="#8a8a8a" style={styles.docLabelInput} />
        ) : (
          <Text style={styles.docLabel}>{label}</Text>
        )}
        {(field.options || []).map((option, optionIndex) => {
          const on = many ? picked.includes(option.id) : picked === option.id;
          return (
            <View key={option.id} style={styles.optionLine}>
              <Bullet on={preview && on} box={many || field.kind === 'dropdown'} />
              {editing ? (
                <TextInput
                  value={option.label}
                  onChangeText={(next) => onPatch({ options: field.options.map((row, i) => (i === optionIndex ? { ...row, label: next } : row)) })}
                  placeholder={`Alternativ ${optionIndex + 1}`}
                  placeholderTextColor="#8a8a8a"
                  style={styles.optionInput}
                />
              ) : (
                <Text
                  style={styles.optionText}
                  onPress={preview ? () => {
                    if (!many) onAnswer(option.id);
                    else onAnswer(on ? picked.filter((id) => id !== option.id) : [...picked, option.id]);
                  } : onSelect}
                >
                  {option.label || `Alternativ ${optionIndex + 1}`}
                </Text>
              )}
              {option.image ? <Image source={{ uri: option.image }} style={styles.optionImage} /> : null}
              {editing ? (
                <TouchableOpacity onPress={() => onOptionImage(optionIndex)} accessibilityRole="button" accessibilityLabel="Bilde på alternativ">
                  <Ionicons name="image-outline" size={14} color={QUIET} />
                </TouchableOpacity>
              ) : null}
              {editing ? (
                <TouchableOpacity onPress={() => onPatch({ options: field.options.filter((_, i) => i !== optionIndex) })} accessibilityRole="button" accessibilityLabel="Fjern alternativ">
                  <Text style={styles.quiet}>×</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
        {field.other ? (
          preview ? (
            <View style={styles.optionLine}>
              <Bullet on={String(many ? picked.find((id) => String(id).startsWith('other:')) : picked).startsWith('other:')} box={many} />
              <TextInput
                value={many
                  ? String((picked || []).find((id) => String(id).startsWith('other:')) || '').slice(6)
                  : (String(picked || '').startsWith('other:') ? String(picked).slice(6) : '')}
                onChangeText={(next) => {
                  if (!many) onAnswer(next ? `other:${next}` : '');
                  else {
                    const kept = picked.filter((id) => !String(id).startsWith('other:'));
                    onAnswer(next ? [...kept, `other:${next}`] : kept);
                  }
                }}
                placeholder="Annet"
                placeholderTextColor="#8a8a8a"
                style={[styles.optionInput, styles.ruleInput]}
              />
            </View>
          ) : (
            <View style={styles.optionLine}>
              <Bullet box={many} />
              <Text style={styles.optionText}>Annet</Text>
            </View>
          )
        ) : null}
        {editing ? (
          <View style={styles.inlineLinks}>
            <Text style={styles.link} onPress={() => onPatch({ options: [...(field.options || []), { id: `${field.id}_${(field.options || []).length}`, label: '' }] })}>Legg til alternativ</Text>
            {field.kind !== 'dropdown' ? (
              <Text style={styles.link} onPress={() => onPatch({ other: !field.other })}>{field.other ? 'Fjern Annet' : 'Legg til Annet'}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  } else if (field.kind === 'scale') {
    const max = field.scaleMax || 5;
    const current = String(value || '');
    body = (
      <View>
        {editing ? (
          <TextInput value={field.label} onChangeText={(next) => onPatch({ label: next })} style={styles.docLabelInput} />
        ) : <Text style={styles.docLabel}>{label}</Text>}
        <View style={styles.scaleRow}>
          {Array.from({ length: max }, (_, i) => String(i + 1)).map((n) => (
            <Text
              key={n}
              onPress={preview ? () => onAnswer(n) : onSelect}
              style={[styles.scaleN, preview && current === n && styles.scaleOn]}
            >
              {n}
            </Text>
          ))}
        </View>
        <View style={styles.scaleEnds}>
          <Text style={styles.docQuiet}>{field.lowLabel || 'Lav'}</Text>
          <Text style={styles.docQuiet}>{field.highLabel || 'Høy'}</Text>
        </View>
      </View>
    );
  } else if (field.kind === 'check') {
    body = (
      <View style={styles.optionLine}>
        <Bullet on={!!value} box />
        <Text style={styles.docBody} onPress={preview ? () => onAnswer(!value) : onSelect}>{label}</Text>
      </View>
    );
  } else if (field.kind === 'image' || field.kind === 'file') {
    body = (
      <View>
        {editing ? (
          <TextInput value={field.label} onChangeText={(next) => onPatch({ label: next })} style={styles.docLabelInput} />
        ) : <Text style={styles.docLabel}>{label}</Text>}
        {preview ? (
          <Text style={styles.link} onPress={() => onAnswer({ name: field.kind === 'image' ? 'bilde.jpg' : 'fil.pdf' })}>
            {value?.name || (field.kind === 'image' ? 'Sett inn bilde' : 'Sett inn fil')}
          </Text>
        ) : (
          <Text style={styles.docQuiet}>{field.kind === 'image' ? 'Bilde settes inn her' : 'Fil settes inn her'}</Text>
        )}
      </View>
    );
  } else {
    const placeholder = field.kind === 'date' ? 'ÅÅÅÅ-MM-DD' : field.kind === 'time' ? 'TT:MM' : field.kind === 'number' ? '0' : '';
    body = (
      <View>
        {editing ? (
          <TextInput value={field.label} onChangeText={(next) => onPatch({ label: next })} placeholder="Tekst" placeholderTextColor="#8a8a8a" style={styles.docLabelInput} />
        ) : <Text style={styles.docLabel}>{label}</Text>}
        {preview ? (
          <TextInput
            value={String(value || '')}
            onChangeText={onAnswer}
            placeholder={placeholder}
            placeholderTextColor="#8a8a8a"
            multiline={field.kind === 'long'}
            keyboardType={field.kind === 'number' ? 'decimal-pad' : 'default'}
            style={[styles.ruleInput, field.kind === 'long' && styles.ruleLong]}
          />
        ) : (
          <View style={[styles.rule, field.kind === 'long' && styles.ruleLong]}>
            {placeholder ? <Text style={styles.docQuiet}>{placeholder}</Text> : null}
          </View>
        )}
      </View>
    );
  }

  const frame = (
    <View style={[styles.fieldWrap, field.kind === 'title' && styles.sectionWrap]}>
      {editing ? <View style={styles.selectBar} /> : null}
      {editing && showGrip ? (
        <View
          onPointerDown={onDrag}
          accessibilityRole="button"
          accessibilityLabel={`Dra ${field.label || 'felt'}`}
          style={styles.grip}
        >
          <Ionicons name="reorder-three" size={16} color={QUIET} />
        </View>
      ) : null}
      {body}
    </View>
  );
  if (preview || editing) return frame;
  return (
    <TouchableOpacity activeOpacity={1} onPress={onSelect} accessibilityRole="button" accessibilityLabel={field.label || 'Felt'}>
      {frame}
    </TouchableOpacity>
  );
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
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [studioWidth, setStudioWidth] = useState(0);
  const [rail, setRail] = useState('modules');
  const [railOpen, setRailOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [typeOpen, setTypeOpen] = useState(false);
  const [moduleQuery, setModuleQuery] = useState('');
  const [answers, setAnswers] = useState({});
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [sendNote, setSendNote] = useState('');
  const [responseTab, setResponseTab] = useState('summary');
  const [person, setPerson] = useState(0);
  const [drag, setDrag] = useState(null);
  const [imageNote, setImageNote] = useState('');
  const [previewSeed, setPreviewSeed] = useState(1);
  const [paperHeight, setPaperHeight] = useState(PAGE_H);
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
  const docked = studioWidth ? studioWidth >= 960 : windowWidth >= 1280;
  const pageScale = docked ? Math.min(1, Math.max(0.72, (Math.max(studioWidth, 960) - 300 - 36) / PAGE_W)) : 1;

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
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const id = 'protop-form-print';
    if (document.getElementById(id)) return undefined;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = '@media print { body * { visibility: hidden !important; } #protop-form-sheet, #protop-form-sheet * { visibility: visible !important; } #protop-form-scale, #protop-form-sheet { transform: none !important; width: 210mm !important; height: auto !important; overflow: visible !important; box-shadow: none !important; } #protop-form-sheet { position: absolute !important; left: 0 !important; top: 0 !important; } }';
    document.head.appendChild(style);
    return undefined;
  }, []);

  function patch(index, part) {
    onDraft({
      ...draft,
      fields: draft.fields.map((field, i) => (i === index ? { ...field, ...part } : field)),
    });
  }

  function addModule(moduleId, at) {
    const index = at == null ? Math.min(selected + 1, draft.fields.length) : at;
    const fields = insertModule(draft.fields, index, moduleId);
    onDraft({ ...draft, fields });
    setSelected(Math.max(0, Math.min(index, fields.length - 1)));
    setRail('modules');
    if (!docked) setRailOpen(false);
  }

  function changeKind(index, kind) {
    const current = draft.fields[index];
    if (!current) return;
    const optionKind = ['choice', 'checks', 'dropdown'].includes(kind);
    const options = optionKind
      ? ((current.options || []).length
        ? current.options
        : [{ id: `${current.id}_a`, label: 'Alternativ 1' }, { id: `${current.id}_b`, label: 'Alternativ 2' }])
      : [];
    patch(index, {
      kind,
      options,
      other: optionKind && kind !== 'dropdown' ? !!current.other : false,
      shuffle: optionKind ? !!current.shuffle : false,
    });
  }

  function openRail(id) {
    if (id === 'preview') setPreviewSeed((Date.now() % 100000) || 1);
    setRail(id);
    if (!docked && id === 'preview') setRailOpen(false);
    else if (!docked) setRailOpen(true);
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

  function beginDrag(payload, label, event) {
    const point = pointFrom(event);
    if (!Number.isFinite(point.x)) return;
    event.preventDefault?.();
    listenersRef.current?.();
    listenersRef.current = null;
    sessionRef.current = { payload, label, startX: point.x, startY: point.y, moved: false };
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
      setDrag({
        label: session.label,
        x: next.x,
        y: next.y,
        active: true,
        hover: insertionIndex(next.x, next.y, rects, canvas),
      });
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
      const target = dragTargetIndex(session.payload, hover, current.fields.length);
      const fields = applyDrag(current.fields, session.payload, target);
      onDraft({ ...current, fields });
      if (String(session.payload).startsWith('move:')) {
        const from = Number(String(session.payload).slice(5));
        const land = from < hover ? hover - 1 : hover;
        setSelected(Math.max(0, Math.min(land, fields.length - 1)));
      } else setSelected(Math.max(0, Math.min(target, fields.length - 1)));
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

  const preview = rail === 'preview';
  const previewFields = settings.shuffleQuestions && preview ? mixRows(draft.fields, previewSeed) : draft.fields;
  const required = draft.fields.filter((field) => field.required && field.kind !== 'title');
  const done = required.filter((field) => answered(field, answers[field.id])).length;
  const progress = required.length ? done / required.length : 1;
  const active = draft.fields[selected] || null;
  const activePerson = responses[person] || null;
  const needle = moduleQuery.trim().toLocaleLowerCase('nb-NO');
  const modules = FORM_MODULES.filter((row) => !needle || `${row.label} ${row.hint}`.toLocaleLowerCase('nb-NO').includes(needle));
  const groups = [];
  modules.forEach((row) => {
    const found = groups.find((group) => group.label === row.group);
    if (found) found.items.push(row);
    else groups.push({ label: row.group, items: [row] });
  });
  const pages = Math.max(1, Math.ceil(paperHeight / PAGE_H));

  function optionsFor(field) {
    if (!preview || !field.shuffle || !(field.options || []).length) return field.options || [];
    return mixRows(field.options, previewSeed + String(field.id).length);
  }

  const railBody = (
    <View style={styles.railBody}>
      <View style={styles.railTabs}>
        {RAIL.map(([id, label]) => (
          <TouchableOpacity key={id} onPress={() => openRail(id)} accessibilityRole="button" accessibilityLabel={label} style={[styles.railTab, rail === id && { borderBottomColor: colors.brand }]}>
            <Text style={{ color: rail === id ? colors.brand : colors.muted, fontSize: 13 }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {rail === 'modules' ? (
        <View style={styles.moduleColumn}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.railScroll} keyboardShouldPersistTaps="handled">
            <TextInput
              value={moduleQuery}
              onChangeText={setModuleQuery}
              placeholder="Søk i moduler"
              placeholderTextColor={colors.placeholder}
              style={[styles.search, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            <TouchableOpacity onPress={setCover} accessibilityRole="button" accessibilityLabel="Forsidebilde">
              <Text style={{ color: colors.brand, fontSize: 13 }}>{draft.cover ? 'Bytt forsidebilde' : 'Legg til forsidebilde'}</Text>
            </TouchableOpacity>
            {draft.cover ? (
              <TouchableOpacity onPress={() => onDraft({ ...draft, cover: '' })} accessibilityRole="button">
                <Text style={{ color: colors.danger, fontSize: 13 }}>Fjern forsidebilde</Text>
              </TouchableOpacity>
            ) : null}
            {groups.map((group) => (
              <View key={group.label} style={{ gap: 6 }}>
                <Text style={[styles.kicker, { color: colors.muted }]}>{group.label}</Text>
                {group.items.map((mod) => (
                  <View key={mod.id} style={[styles.moduleRow, { borderColor: colors.line, backgroundColor: colors.bg }]}>
                    {docked ? (
                      <View
                        onPointerDown={(event) => beginDrag(`module:${mod.id}`, mod.label, event)}
                        accessibilityRole="button"
                        accessibilityLabel={`Dra ${mod.label}`}
                        style={[styles.moduleGrip, { backgroundColor: colors.sunken }]}
                      >
                        <Ionicons name="reorder-three" size={16} color={colors.muted} />
                      </View>
                    ) : null}
                    <TouchableOpacity onPress={() => addModule(mod.id)} accessibilityRole="button" accessibilityLabel={`Legg til ${mod.label}`} style={{ flex: 1, gap: 1 }}>
                      <View style={styles.moduleTitle}>
                        <Ionicons name={ICONS[mod.id] || 'ellipse-outline'} size={15} color={colors.brand} />
                        <Text style={{ color: colors.ink, fontSize: 14 }}>{mod.label}</Text>
                      </View>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>{mod.hint}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ))}
            {!groups.length ? <Text style={{ color: colors.muted }}>Ingen moduler treffer søket.</Text> : null}
          </ScrollView>
          {active ? (
            <View style={[styles.selectedBox, { borderTopColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontSize: 13 }}>Valgt · {active.label || 'Felt'}</Text>
              <TouchableOpacity onPress={() => setTypeOpen((value) => !value)} accessibilityRole="button" accessibilityLabel="Velg felttype">
                <Text style={{ color: colors.brand, fontSize: 13 }}>Type · {fieldType(active.kind).label}</Text>
              </TouchableOpacity>
              {typeOpen ? (
                <View style={styles.typeWrap}>
                  {FIELD_TYPES.map((type) => (
                    <TouchableOpacity key={type.id} onPress={() => changeKind(selected, type.id)} accessibilityRole="button" style={[styles.typeChip, { backgroundColor: active.kind === type.id ? colors.brand : colors.sunken }]}>
                      <Text style={{ color: active.kind === type.id ? '#fff' : colors.ink, fontSize: 12 }}>{type.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              {active.kind !== 'title' ? (
                <View style={styles.switchRow}>
                  <Text style={{ color: colors.ink, fontSize: 13 }}>Obligatorisk</Text>
                  <Switch value={!!active.required} onValueChange={(required) => patch(selected, { required })} />
                </View>
              ) : null}
              {['choice', 'checks', 'dropdown'].includes(active.kind) ? (
                <View style={styles.switchRow}>
                  <Text style={{ color: colors.ink, fontSize: 13 }}>Tilfeldig rekkefølge</Text>
                  <Switch value={!!active.shuffle} onValueChange={(shuffle) => patch(selected, { shuffle })} />
                </View>
              ) : null}
              {active.kind === 'scale' ? (
                <View style={{ gap: 6 }}>
                  <View style={styles.inlineLinks}>
                    {[3, 5, 7, 10].map((n) => (
                      <TouchableOpacity key={n} onPress={() => patch(selected, { scaleMax: n })} accessibilityRole="button" style={[styles.scalePick, { backgroundColor: active.scaleMax === n ? colors.brand : colors.sunken }]}>
                        <Text style={{ color: active.scaleMax === n ? '#fff' : colors.ink }}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput value={active.lowLabel || ''} onChangeText={(lowLabel) => patch(selected, { lowLabel })} placeholder="Etikett for 1" placeholderTextColor={colors.placeholder} style={[styles.search, { color: colors.ink, borderColor: colors.line }]} />
                  <TextInput value={active.highLabel || ''} onChangeText={(highLabel) => patch(selected, { highLabel })} placeholder="Etikett for høyeste" placeholderTextColor={colors.placeholder} style={[styles.search, { color: colors.ink, borderColor: colors.line }]} />
                </View>
              ) : null}
              <View style={styles.inlineLinks}>
                <Text style={{ color: colors.brand, fontSize: 13 }} onPress={() => { onDraft({ ...draft, fields: duplicateField(draft.fields, selected) }); setSelected(selected + 1); }}>Kopier</Text>
                <Text style={{ color: colors.brand, fontSize: 13 }} onPress={() => { onDraft({ ...draft, fields: moveField(draft.fields, selected, selected - 1) }); setSelected(Math.max(0, selected - 1)); }}>Opp</Text>
                <Text style={{ color: colors.brand, fontSize: 13 }} onPress={() => { onDraft({ ...draft, fields: moveField(draft.fields, selected, selected + 1) }); setSelected(Math.min(draft.fields.length - 1, selected + 1)); }}>Ned</Text>
                <Text
                  style={{ color: colors.danger, fontSize: 13 }}
                  onPress={() => {
                    const fields = draft.fields.filter((_, i) => i !== selected);
                    onDraft({ ...draft, fields });
                    setSelected(Math.max(0, selected - 1));
                  }}
                >
                  Slett
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
      {rail === 'preview' ? (
        <ScrollView contentContainerStyle={styles.railScroll}>
          <Text style={{ color: colors.ink, fontSize: 15 }}>Slik ser malen ut</Text>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>
            Siden følger en Word-mal. Fyll ut feltene for å se linjene, og send inn for å lagre et prøvesvar.
          </Text>
          {PAGE_SPEC.map(([key, value]) => (
            <View key={key} style={styles.specRow}>
              <Text style={{ color: colors.muted, fontSize: 13, width: 110 }}>{key}</Text>
              <Text style={{ color: colors.ink, fontSize: 13, flex: 1 }}>{value}</Text>
            </View>
          ))}
          {settings.collectEmail ? (
            <TextInput value={email} onChangeText={setEmail} placeholder="E-post" placeholderTextColor={colors.placeholder} autoCapitalize="none" keyboardType="email-address" style={[styles.search, { color: colors.ink, borderColor: colors.line }]} />
          ) : null}
          {!!sendNote && <Text style={{ color: colors.danger }}>{sendNote}</Text>}
          {sent ? <Text style={{ color: colors.brand }}>{settings.confirmation || 'Svaret er sendt.'}</Text> : null}
          <TouchableOpacity onPress={submit} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]}>
            <Text style={{ color: '#fff' }}>Send inn</Text>
          </TouchableOpacity>
          {sent && settings.anotherResponse ? (
            <Text style={{ color: colors.brand }} onPress={() => { setSent(false); setAnswers({}); setEmail(''); setSendNote(''); }}>Send et annet svar</Text>
          ) : null}
          {sent && settings.showSummary ? (
            <Text style={{ color: colors.brand }} onPress={() => openRail('responses')}>Se sammendrag</Text>
          ) : null}
        </ScrollView>
      ) : null}
      {rail === 'responses' ? (
        <ScrollView contentContainerStyle={styles.railScroll}>
          <Text style={{ color: colors.muted }}>{responses.length} svar</Text>
          <TouchableOpacity onPress={exportCsv} accessibilityRole="button" style={styles.menuRow}>
            <Ionicons name="download-outline" size={16} color={colors.ink} />
            <Text style={{ color: colors.ink }}>Eksporter til CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { if (typeof window !== 'undefined') window.print(); }} accessibilityRole="button" style={styles.menuRow}>
            <Ionicons name="print-outline" size={16} color={colors.ink} />
            <Text style={{ color: colors.ink }}>Skriv ut</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDraft({ ...draft, responses: [] })} accessibilityRole="button" style={styles.menuRow}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={{ color: colors.danger }}>Slette alle</Text>
          </TouchableOpacity>
          <View style={styles.inlineLinks}>
            {[['summary', 'Sammendrag'], ['question', 'Spørsmål'], ['person', 'Individuell']].map(([id, label]) => (
              <TouchableOpacity key={id} onPress={() => setResponseTab(id)} accessibilityRole="button" style={[styles.typeChip, { backgroundColor: responseTab === id ? colors.brand : colors.sunken }]}>
                <Text style={{ color: responseTab === id ? '#fff' : colors.ink, fontSize: 12 }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {responseTab === 'person' && responses.length ? (
            <View style={styles.inlineLinks}>
              <Text style={{ color: colors.brand }} onPress={() => setPerson(Math.max(0, person - 1))}>Forrige</Text>
              <Text style={{ color: colors.muted }}>{person + 1} / {responses.length}</Text>
              <Text style={{ color: colors.brand }} onPress={() => setPerson(Math.min(responses.length - 1, person + 1))}>Neste</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
      {rail === 'settings' ? (
        <ScrollView contentContainerStyle={styles.railScroll}>
          {SETTINGS.map(([title, rows]) => (
            <View key={title} style={{ gap: 8 }}>
              <Text style={[styles.kicker, { color: colors.muted }]}>{title}</Text>
              {rows.map(([key, label, help]) => (
                <View key={key} style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontSize: 14 }}>{label}</Text>
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
            style={[styles.search, { color: colors.ink, borderColor: colors.line }]}
          />
        </ScrollView>
      ) : null}
      {!!imageNote && <Text style={{ color: colors.danger, paddingHorizontal: 12, paddingBottom: 8 }}>{imageNote}</Text>}
    </View>
  );

  const showDocument = rail !== 'responses';

  return (
    <View
      ref={setRootNode}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setStudioWidth((prev) => (prev === next ? prev : next));
      }}
      onPointerMove={(event) => pointerRef.current.move(event)}
      onPointerUp={(event) => pointerRef.current.up(event)}
      onPointerCancel={(event) => pointerRef.current.up(event)}
      style={[styles.root, { backgroundColor: colors.bg }, fill ? styles.fill : styles.embed]}
    >
      <View style={[styles.toolbar, { borderBottomColor: colors.line }]}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Alle skjema</Text>
        </TouchableOpacity>
        <View style={styles.toolbarActions}>
          {!docked ? (
            <TouchableOpacity onPress={() => setRailOpen(true)} accessibilityRole="button" accessibilityLabel="Åpne moduler">
              <Text style={{ color: colors.ink }}>Moduler</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={onScan} disabled={busy} accessibilityRole="button" accessibilityLabel="AI-scan">
            <Text style={{ color: colors.brand }}>{busy ? 'Leser …' : 'AI-scan'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onImport} disabled={busy} accessibilityRole="button" accessibilityLabel="Importer">
            <Text style={{ color: colors.brand }}>Importer</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onSave} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff' }}>Lagre</Text>
          </TouchableOpacity>
        </View>
      </View>
      {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand, paddingHorizontal: 12, paddingTop: 8 }}>{note}</Text>}
      <View style={styles.body}>
        <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageScrollContent}>
          <View nativeID="protop-form-scale" style={[styles.scaleFrame, docked && { height: paperHeight * pageScale, width: PAGE_W * pageScale, overflow: 'hidden' }]}>
            <View style={docked ? { width: PAGE_W, position: 'absolute', top: 0, left: 0, transform: [{ scale: pageScale }], transformOrigin: 'top left' } : { width: '100%' }}>
              <View
                nativeID="protop-form-sheet"
                onLayout={(event) => {
                  const next = Math.round(event.nativeEvent.layout.height);
                  if (next > 0) setPaperHeight((prev) => (prev === next ? prev : next));
                }}
                style={[styles.paper, docked && { width: PAGE_W, minHeight: PAGE_H }]}
              >
                {docked && pages > 1 ? Array.from({ length: pages - 1 }, (_, index) => (
                  <View key={index} pointerEvents="none" style={[styles.pageBreak, { top: (index + 1) * PAGE_H }]} />
                )) : null}
                <View ref={canvasRef} style={[styles.margin, !docked && styles.marginPhone]}>
                  {draft.cover ? <Image source={{ uri: draft.cover }} style={styles.cover} resizeMode="contain" /> : null}
                  {preview ? (
                    <Text style={styles.docTitle}>{draft.title || 'Uten navn'}</Text>
                  ) : (
                    <TextInput
                      value={draft.title}
                      onChangeText={(title) => onDraft({ ...draft, title })}
                      placeholder="Navn på skjemaet"
                      placeholderTextColor="#8a8a8a"
                      style={styles.docTitleInput}
                    />
                  )}
                  <View style={styles.titleRule} />
                  {preview ? (
                    draft.intro ? <Text style={styles.docIntro}>{draft.intro}</Text> : null
                  ) : (
                    <TextInput
                      value={draft.intro}
                      onChangeText={(intro) => onDraft({ ...draft, intro })}
                      placeholder="Beskrivelse"
                      placeholderTextColor="#8a8a8a"
                      multiline
                      scrollEnabled={false}
                      style={styles.docIntroInput}
                    />
                  )}
                  {preview && settings.progress ? (
                    <View style={styles.track}>
                      <View style={[styles.bar, { width: `${Math.round(progress * 100)}%` }]} />
                    </View>
                  ) : null}
                  {preview && settings.requireLogin ? <Text style={styles.docQuiet}>Innlogging kreves for å sende inn.</Text> : null}
                  {showDocument ? previewFields.map((field, index) => (
                    <View key={field.id}>
                      {!preview && drag?.active && drag.hover === index ? <Text style={[styles.dropLine, { color: colors.brand }]}>Slipp modulen her</Text> : null}
                      <View ref={(node) => { fieldRefs.current[index] = node; }} collapsable={false}>
                        <PaperField
                          field={{ ...field, options: optionsFor(field) }}
                          preview={preview}
                          selected={index === selected}
                          showGrip={docked}
                          value={answers[field.id] ?? (field.kind === 'check' ? false : field.kind === 'checks' ? [] : '')}
                          onSelect={() => setSelected(index)}
                          onPatch={(part) => patch(index, part)}
                          onAnswer={(next) => setAnswers((current) => ({ ...current, [field.id]: next }))}
                          onDrag={(event) => beginDrag(`move:${index}`, field.label || 'Felt', event)}
                          onOptionImage={(optionIndex) => setOptionImage(index, optionIndex)}
                        />
                      </View>
                    </View>
                  )) : (
                    <View style={{ gap: AFTER }}>
                      <Text style={styles.docTitle}>Svar</Text>
                      <Text style={styles.docQuiet}>{responses.length} svar</Text>
                      {responseTab === 'person' && !responses.length ? <Text style={styles.docBody}>Ingen svar ennå.</Text> : null}
                      {responseTab === 'person' && activePerson ? (
                        <View style={{ gap: AFTER }}>
                          {activePerson.email ? <Text style={styles.docBody}>{activePerson.email}</Text> : null}
                          {draft.fields.filter((field) => field.kind !== 'title').map((field) => (
                            <View key={field.id}>
                              <Text style={styles.docLabel}>{field.label}</Text>
                              <Text style={styles.docBody}>{displayAnswer(field, activePerson.answers?.[field.id]) || '—'}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      {responseTab !== 'person' ? draft.fields.filter((field) => field.kind !== 'title').map((field) => {
                        const summary = summarizeQuestion(field, responses);
                        return (
                          <View key={field.id} style={{ gap: 4 }}>
                            <Text style={styles.docLabel}>{field.label}</Text>
                            <Text style={styles.docQuiet}>{summary.answered} svar</Text>
                            {summary.counts && summary.answered ? <PieChart counts={summary.counts} /> : null}
                            {field.kind === 'scale' && summary.answered ? <Text style={styles.docBody}>Snitt {summary.average}</Text> : null}
                            {(summary.texts || []).map((line) => <Text key={line} style={styles.docBody}>{line}</Text>)}
                            {!summary.answered ? <Text style={styles.docQuiet}>Ingen svar ennå på dette spørsmålet.</Text> : null}
                          </View>
                        );
                      }) : null}
                    </View>
                  )}
                  {showDocument && !preview && drag?.active && drag.hover === draft.fields.length ? (
                    <Text style={[styles.dropLine, { color: colors.brand }]}>Slipp modulen her</Text>
                  ) : null}
                  {showDocument && !draft.fields.length ? <Text style={styles.docQuiet}>Legg til en modul fra menyen.</Text> : null}
                  {preview && sent ? <Text style={[styles.docBody, { marginTop: AFTER }]}>{settings.confirmation || 'Svaret er sendt.'}</Text> : null}
                </View>
                {docked && paperHeight <= PAGE_H ? <Text style={styles.pageNumber}>1</Text> : null}
              </View>
            </View>
          </View>
        </ScrollView>
        {docked ? (
          <View style={[styles.rail, { width: 300, borderLeftColor: colors.line, backgroundColor: colors.card }]}>
            {railBody}
          </View>
        ) : null}
      </View>
      {!docked && railOpen ? (
        <View style={styles.drawerWrap}>
          <TouchableOpacity style={styles.scrim} onPress={() => setRailOpen(false)} accessibilityRole="button" accessibilityLabel="Lukk moduler" />
          <View style={[styles.drawer, { backgroundColor: colors.card, borderLeftColor: colors.line }]}>
            {railBody}
          </View>
        </View>
      ) : null}
      <Ghost drag={drag} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 640 },
  fill: { flex: 1, minHeight: 0 },
  embed: { minHeight: 720 },
  toolbar: { minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottomWidth: 1 },
  toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end' },
  save: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  body: { flex: 1, minHeight: 0, flexDirection: 'row' },
  pageScroll: { flex: 1, minWidth: 0 },
  pageScrollContent: { paddingVertical: 28, paddingHorizontal: 16, alignItems: 'center' },
  scaleFrame: { alignSelf: 'center' },
  paper: {
    backgroundColor: PAPER,
    width: '100%',
    maxWidth: PAGE_W,
    alignSelf: 'center',
    position: 'relative',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  margin: { paddingHorizontal: MARGIN, paddingTop: MARGIN, paddingBottom: MARGIN },
  marginPhone: { paddingHorizontal: 28, paddingTop: 32, paddingBottom: 36 },
  cover: { width: '100%', height: 96, marginBottom: 12 },
  titleRule: { height: 0, borderBottomWidth: 1, borderBottomColor: HAIR, marginTop: 8, marginBottom: 12 },
  fieldWrap: { position: 'relative', marginBottom: AFTER },
  sectionWrap: { marginTop: 16 },
  selectBar: { position: 'absolute', left: -14, top: 0, bottom: 0, width: 2, backgroundColor: '#2563eb' },
  grip: { position: 'absolute', left: -42, top: -2, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  docTitle: { fontFamily: FONT, fontSize: 26, lineHeight: 31, fontWeight: '700', color: INK },
  docTitleInput: { fontFamily: FONT, fontSize: 26, lineHeight: 31, fontWeight: '700', color: INK, padding: 0, margin: 0, borderWidth: 0, outlineWidth: 0 },
  docIntro: { fontFamily: FONT, fontSize: BODY, lineHeight: 22, color: INK, marginBottom: 14 },
  docIntroInput: { fontFamily: FONT, fontSize: BODY, lineHeight: 22, color: INK, padding: 0, margin: 0, borderWidth: 0, outlineWidth: 0, minHeight: 22, marginBottom: 8, overflow: 'hidden' },
  docHeading: { fontFamily: FONT, fontSize: 19, lineHeight: 23, fontWeight: '700', color: INK },
  docHeadingInput: { fontFamily: FONT, fontSize: 19, lineHeight: 23, fontWeight: '700', color: INK, padding: 0, borderWidth: 0 },
  docLabel: { fontFamily: FONT, fontSize: BODY, lineHeight: LEADING, fontWeight: '700', color: INK },
  docLabelInput: { fontFamily: FONT, fontSize: BODY, lineHeight: LEADING, fontWeight: '700', color: INK, padding: 0, borderWidth: 0, outlineWidth: 0 },
  docBody: { fontFamily: FONT, fontSize: BODY, lineHeight: LEADING, color: INK },
  docQuiet: { fontFamily: FONT, fontSize: BODY, lineHeight: LEADING, color: QUIET },
  rule: { minHeight: 22, borderBottomWidth: 1, borderBottomColor: HAIR, justifyContent: 'flex-end' },
  ruleLong: { minHeight: 88 },
  ruleInput: { fontFamily: FONT, fontSize: BODY, lineHeight: LEADING, color: INK, minHeight: 22, borderBottomWidth: 1, borderBottomColor: HAIR, borderWidth: 0, outlineWidth: 0, padding: 0, margin: 0 },
  optionLine: { minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionText: { fontFamily: FONT, fontSize: BODY, lineHeight: LEADING, color: INK, flex: 1 },
  optionInput: { fontFamily: FONT, fontSize: BODY, lineHeight: LEADING, color: INK, flex: 1, padding: 0, borderWidth: 0, outlineWidth: 0, margin: 0 },
  bullet: { width: 11, height: 11, borderRadius: 6, borderWidth: 1, borderColor: HAIR },
  bulletBox: { borderRadius: 2 },
  bulletOn: { backgroundColor: INK },
  optionImage: { width: 22, height: 22 },
  inlineLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 4 },
  link: { fontFamily: FONT, fontSize: 13, lineHeight: 17, color: INK, textDecorationLine: 'underline' },
  quiet: { fontFamily: FONT, fontSize: 12, color: QUIET },
  scaleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  scaleN: { fontFamily: FONT, width: 22, height: 22, lineHeight: 20, textAlign: 'center', borderWidth: 1, borderColor: HAIR, borderRadius: 11, color: INK, fontSize: 12 },
  scaleOn: { backgroundColor: INK, color: PAPER },
  scaleEnds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  dropLine: { fontFamily: FONT, fontSize: BODY, lineHeight: 28, marginBottom: 4 },
  pageBreak: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderTopColor: '#d4d4d4' },
  pageNumber: { position: 'absolute', bottom: 48, left: 0, right: 0, textAlign: 'center', fontFamily: FONT, fontSize: 11, color: QUIET },
  track: { height: 2, backgroundColor: '#e5e5e5', marginBottom: 12 },
  bar: { height: 2, backgroundColor: INK },
  rail: { borderLeftWidth: 1, minHeight: 0 },
  railBody: { flex: 1, minHeight: 0 },
  railTabs: { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  railTab: { paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  railScroll: { padding: 12, gap: 10, paddingBottom: 28 },
  search: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, fontSize: 14 },
  kicker: { fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  moduleRow: { borderWidth: 1, borderRadius: 8, padding: 8, flexDirection: 'row', gap: 8, alignItems: 'center' },
  moduleGrip: { width: 24, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  moduleTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  moduleColumn: { flex: 1, minHeight: 0, overflow: 'hidden' },
  selectedBox: { borderTopWidth: 1, padding: 12, gap: 8, maxHeight: 280, zIndex: 2 },
  typeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  scalePick: { minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  specRow: { flexDirection: 'row', gap: 8 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  pieRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 4 },
  drawerWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, flexDirection: 'row', justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  drawer: { width: '86%', maxWidth: 360, borderLeftWidth: 1, zIndex: 21 },
  ghost: { position: 'fixed', zIndex: 40, backgroundColor: PAPER, borderWidth: 1, borderColor: HAIR, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  ghostText: { fontFamily: FONT, color: INK, fontSize: 13 },
});
