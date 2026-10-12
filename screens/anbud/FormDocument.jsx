import React, { useEffect } from 'react';
import { Image, Platform, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fieldType } from '../../src/anbud/formBuilder';
import FormAnswer from './FormAnswer';

const ICONS = {
  title: 'reader-outline',
  note: 'document-outline',
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

const GRID = '#9aa3ae';
const LABEL_BG = '#f3f5f8';
const SECTION_BG = '#e7edf4';
const INK = '#1c2430';
const GHOST = '#4e5966';
const FACE = Platform.OS === 'web' ? { fontFamily: 'Carlito, Calibri, "Segoe UI", Helvetica, Arial, sans-serif' } : null;
const SCRIPT = Platform.OS === 'web' ? { fontFamily: 'Caveat, "Segoe Script", cursive' } : null;

const META_KEYS = ['Dokument navn', 'Dokument ID', 'Dokumenteier', 'Godkjent av', 'Sist endret', 'Opprettet', 'Godkjent', 'Versjon'];
const DATE_KEYS = new Set(['Opprettet', 'Sist endret', 'Godkjent']);
const CUES = [
  ['post nr', 'Post nr.'],
  ['postnr', 'Post nr.'],
  ['organisasjonsnummer', 'Organisasjonsnr.'],
  ['organisasjons nr', 'Organisasjonsnr.'],
  ['telefon nr', 'Telefon'],
  ['oppstart', 'Oppstart'],
  ['sluttdato', 'Sluttdato'],
  ['adresse', 'Adresse'],
  ['e-post', 'E-post'],
  ['epost', 'E-post'],
  ['telefon', 'Telefon'],
  ['dato', 'Dato'],
  ['sted', 'Sted'],
];

function signatureField(field) {
  return field?.kind === 'image' && /signatur|underskrift/i.test(`${field.label || ''} ${field.review || ''}`);
}

function sameTitle(left, right) {
  return String(left || '').trim().toLocaleLowerCase('nb-NO') === String(right || '').trim().toLocaleLowerCase('nb-NO');
}

function headerNote(field) {
  return field?.kind === 'note' && /ledelsessystem|dokument\s*(navn|id)|dokumenteier|godkjent av|\bversjon\b/i.test(field.label || '');
}

function footerNote(field) {
  return field?.kind === 'note' && /org\.\s*\d|sentralbord|utskriftstidspunkt|\bsidetall\b|\bwww\.|^web:|e-?post:/i.test(field.label || '');
}

function companyFrom(notes) {
  const line = notes.find((item) => /ledelsessystem/i.test(item.field?.label || ''))?.field?.label || '';
  return line.split(/\s+-\s+/)[0].trim();
}

function wordmarkOf(name) {
  return String(name || '').replace(/\s+AS$/i, '').trim();
}

function bracket(field) {
  const raw = String(field?.placeholder || '').trim();
  if (raw) return raw.startsWith('[') ? raw : `[${raw}]`;
  if (field?.kind === 'date') return '[Dato]';
  if (field?.kind === 'time') return '[TT:MM]';
  return '';
}

function escapeReg(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function metaPairs(label) {
  const keys = META_KEYS.slice().sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${keys.map(escapeReg).join('|')})`, 'ig');
  if (!re.test(label)) return [];
  const bits = String(label).split(re).map((part) => part.trim()).filter(Boolean);
  const pairs = [];
  for (let i = 0; i < bits.length; i += 1) {
    const key = META_KEYS.find((item) => item.toLocaleLowerCase('nb-NO') === bits[i].toLocaleLowerCase('nb-NO'));
    if (!key) continue;
    const next = bits[i + 1];
    const nextIsKey = next && META_KEYS.some((item) => item.toLocaleLowerCase('nb-NO') === next.toLocaleLowerCase('nb-NO'));
    pairs.push({ key, value: next && !nextIsKey ? next : '' });
    if (next && !nextIsKey) i += 1;
  }
  return pairs;
}

function headerLayout(header) {
  let brand = '';
  const pairs = [];
  header.forEach((item) => {
    const label = item.field?.label || '';
    if (/ledelsessystem/i.test(label) && !brand) brand = label.split(new RegExp(`\\s+(?:${META_KEYS.map(escapeReg).join('|')})`, 'i'))[0].trim();
    metaPairs(label).forEach((pair) => pairs.push({ ...pair, index: item.index }));
  });
  const dates = pairs.filter((pair) => DATE_KEYS.has(pair.key));
  const rest = pairs.filter((pair) => !DATE_KEYS.has(pair.key));
  const rows = [];
  let current = [];
  rest.forEach((pair) => {
    const wide = pair.key === 'Dokument navn' || String(pair.value || '').length > 24;
    if (wide) {
      if (current.length) rows.push(current);
      current = [];
      rows.push([pair]);
      return;
    }
    current.push(pair);
    if (current.length >= 4) {
      rows.push(current);
      current = [];
    }
  });
  if (current.length) rows.push(current);
  return { brand, dates, rows, parsed: !!(brand || pairs.length) };
}

function footerBits(left, right, company) {
  const blob = [...left, ...right].map((item) => item.field?.label || '').join('  ');
  const pick = (re) => {
    const match = blob.match(re);
    return match ? match[0].replace(/\s+/g, ' ').trim() : '';
  };
  return {
    company,
    org: pick(/Org\.\s*[\d ]{6,14}/i),
    phone: pick(/Sentralbord:\s*[\d ]{6,18}/i),
    web: pick(/Web:\s*\S+/i),
    mail: pick(/E-?post:\s*\S+/i),
    showPrint: /utskriftstidspunkt/i.test(blob),
    printed: (blob.match(/Utskriftstidspunkt\s+((?:\d|[0-9]{1,2}\.).+?)(?=\s+Sidetall|$)/i) || [])[1] || '',
    showPage: /sidetall/i.test(blob),
    page: (blob.match(/Sidetall\s+(\d+\s+av\s+\d+|\d+)/i) || [])[1] || '',
    parsed: /org\.|sentralbord|www\.|e-?post:|utskrift|sidetall/i.test(blob),
  };
}

function cueSplit(label) {
  const value = String(label || '').replace(/[:.]\s*$/, '').trim();
  const lower = value.toLocaleLowerCase('nb-NO');
  for (const [cue, pretty] of CUES) {
    if (lower === cue) return { group: '', cue: pretty, raw: value };
    if (lower.endsWith(` ${cue}`) && lower.length > cue.length + 1) {
      const group = value.slice(0, value.length - cue.length).trim();
      if (group && group.split(/\s+/).length <= 4) return { group, cue: pretty, raw: value };
    }
  }
  return { group: '', cue: '', raw: value };
}

function checksFace(label) {
  const match = String(label || '').match(/^(.*?)\s+(Velg\b.+)$/i);
  if (!match) return null;
  const prompt = match[2].replace(/:\s*$/, '');
  return { label: match[1].trim(), prompt: `${prompt}:` };
}

function staticFace(field) {
  if (field?.placeholder || !['text', 'long', 'number'].includes(field?.kind)) return null;
  const match = String(field.label || '').match(/^(Oppdragstaker|Oppdragsgiver|Oppdragsleder)\s+(.{2,60})$/);
  if (!match) return null;
  return { label: match[1], value: match[2].trim() };
}

function faceOf(field) {
  const baked = staticFace(field);
  if (baked) return { label: baked.label, prefix: '', baked: baked.value };
  const checks = field?.kind === 'checks' ? checksFace(field.label) : null;
  if (checks) return { label: checks.label, prefix: checks.prompt, baked: '' };
  const split = cueSplit(field?.label);
  if (split.group) return { label: split.group, prefix: `${split.cue}:`, baked: '' };
  return { label: field?.label || 'Felt', prefix: '', baked: '' };
}

function isPost(field) {
  return /post\s*nr/i.test(field?.label || '');
}

function isPlace(field) {
  return /^sted\b/i.test(String(field?.label || '').replace(/[:.].*$/, ''));
}

function isAddress(field) {
  return cueSplit(field?.label).cue === 'Adresse' || /\badresse\b/i.test(field?.label || '');
}

function sheetModel(fields, title) {
  const header = [];
  const footer = [];
  const body = [];
  (Array.isArray(fields) ? fields : []).forEach((field, index) => {
    const item = { field, index };
    if (headerNote(field)) header.push(item);
    else if (footerNote(field)) footer.push(item);
    else if (!(field.kind === 'title' && sameTitle(field.label, title))) body.push(item);
  });
  const blocks = [];
  for (let i = 0; i < body.length; i += 1) {
    const item = body[i];
    const next = body[i + 1];
    const third = body[i + 2];
    if (signatureField(item.field)) {
      const items = [item];
      if (next && signatureField(next.field)) {
        items.push(next);
        i += 1;
      }
      blocks.push({ type: 'sign', items });
      continue;
    }
    if (item.field.kind === 'title') {
      blocks.push({ type: 'section', items: [item] });
      continue;
    }
    if (item.field.kind === 'note') {
      blocks.push({ type: 'prose', items: [item] });
      continue;
    }
    if (isAddress(item.field) && next && isPost(next.field)) {
      const items = [item, next];
      i += 1;
      if (third && isPlace(third.field) && !signatureField(third.field)) {
        items.push(third);
        i += 1;
      }
      blocks.push({ type: 'address', items });
      continue;
    }
    const pair = next
      && item.field.width === 'half'
      && next.field.width === 'half'
      && !['title', 'note', 'long'].includes(next.field.kind)
      && !signatureField(next.field);
    if (pair) {
      const shared = faceOf(item.field).prefix && !faceOf(next.field).prefix;
      blocks.push({ type: shared ? 'shared' : 'pair', items: [item, next] });
      i += 1;
      continue;
    }
    blocks.push({ type: 'row', items: [item] });
  }
  const merged = [];
  for (let i = 0; i < blocks.length; i += 1) {
    if (blocks[i].type !== 'prose') {
      merged.push(blocks[i]);
      continue;
    }
    const items = [];
    while (i < blocks.length && blocks[i].type === 'prose') {
      items.push(...blocks[i].items);
      i += 1;
    }
    i -= 1;
    merged.push(items.length >= 4 ? { type: 'columns', items } : { type: 'prose', items });
  }
  const footerLeft = [];
  const footerRight = [];
  footer.forEach((item) => {
    const label = item.field.label || '';
    const cut = label.match(/^(.*?)(\s+Utskriftstidspunkt\b.*)$/i);
    if (cut) {
      if (cut[1].trim()) footerLeft.push({ field: { ...item.field, id: `${item.field.id}_venstre`, label: cut[1].trim() }, index: item.index });
      footerRight.push({ field: { ...item.field, id: `${item.field.id}_hoyre`, label: cut[2].trim() }, index: item.index });
      return;
    }
    if (/utskrift|sidetall/i.test(label)) footerRight.push(item);
    else footerLeft.push(item);
  });
  return { header, footerLeft, footerRight, blocks: merged };
}

function useDocumentFace() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    if (document.getElementById('protop-dokument-skrift')) return undefined;
    const link = document.createElement('link');
    link.id = 'protop-dokument-skrift';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400&family=Caveat:wght@500;600&display=swap';
    document.head.appendChild(link);
    return undefined;
  }, []);
}

function Tick({ radio }) {
  return <View style={[styles.box, radio && styles.boxRound, { borderColor: INK }]} />;
}

function EditValue({ field }) {
  if (field.kind === 'check') {
    return (
      <View style={styles.markItem}>
        <Tick />
        <Text style={[styles.cellText, FACE, { color: INK }]}>Ja / nei</Text>
      </View>
    );
  }
  if (['choice', 'checks', 'dropdown'].includes(field.kind)) {
    const radio = field.kind !== 'checks';
    return (
      <View style={styles.marks}>
        {(field.options || []).map((option) => (
          <View key={option.id} style={styles.markItem}>
            <Tick radio={radio && field.kind !== 'dropdown'} />
            <Text style={[styles.cellText, FACE, { color: INK }]}>{option.label || 'Alternativ'}</Text>
          </View>
        ))}
      </View>
    );
  }
  const ghost = bracket(field);
  if (field.kind === 'long') {
    return <Text style={[styles.prose, FACE, { color: GHOST }]}>{ghost || ' '}</Text>;
  }
  return ghost
    ? <Text style={[styles.ghost, FACE, { color: GHOST }]}>{ghost}</Text>
    : <View style={styles.ghostSpace} />;
}

function proseParts(label) {
  const match = String(label || '').match(/^([a-h]\)\s+[^.]{2,80})\s+([\s\S]+)$/i);
  if (!match) return { head: '', body: label || '' };
  return { head: match[1], body: match[2] };
}

function Inspector({ field, index, colors, onPatch, onType, onDuplicate, onMove, onDelete, onOptionImage, last }) {
  const meta = fieldType(field.kind);
  return (
    <View style={[styles.inspector, { backgroundColor: colors.sunken }]}>
      <TextInput
        value={field.label}
        onChangeText={(label) => onPatch(index, { label })}
        placeholder={field.kind === 'title' ? 'Seksjon' : 'Tekst i dokumentet'}
        placeholderTextColor={colors.placeholder}
        style={[styles.lineInput, FACE, { color: colors.ink, borderBottomColor: colors.line }]}
      />
      <View style={styles.tools}>
        <TouchableOpacity onPress={onType} accessibilityRole="button" accessibilityLabel="Velg felttype" style={[styles.chip, { backgroundColor: colors.card }]}>
          <Ionicons name={ICONS[field.kind] || 'ellipse-outline'} size={15} color={colors.brand} />
          <Text style={{ color: colors.ink }}>{meta.label}</Text>
        </TouchableOpacity>
        {field.kind !== 'title' && field.kind !== 'note' ? (
          <View style={styles.switchRow}>
            <Text style={{ color: colors.ink }}>{field.width === 'half' ? 'Ved siden av' : 'Egen linje'}</Text>
            <Switch value={field.width === 'half'} onValueChange={(half) => onPatch(index, { width: half ? 'half' : 'full' })} />
          </View>
        ) : null}
        {field.kind !== 'title' && field.kind !== 'note' ? (
          <View style={styles.switchRow}>
            <Text style={{ color: colors.ink }}>Obligatorisk</Text>
            <Switch value={!!field.required} onValueChange={(required) => onPatch(index, { required })} />
          </View>
        ) : null}
      </View>
      {field.review ? (
        <View style={styles.tools}>
          <Text style={{ color: '#9a6700', flex: 1 }}>{field.review}</Text>
          <TouchableOpacity onPress={() => onPatch(index, { review: '' })} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Sett som ferdig</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {field.kind !== 'title' ? (
        <TextInput
          value={field.help || ''}
          onChangeText={(help) => onPatch(index, { help })}
          placeholder="Hjelpetekst under linjen"
          placeholderTextColor={colors.placeholder}
          style={[styles.lineInput, FACE, { color: colors.ink, borderBottomColor: colors.line }]}
        />
      ) : null}
      {field.kind !== 'title' && field.kind !== 'note' && !['check', 'choice', 'checks', 'dropdown', 'scale', 'image', 'file'].includes(field.kind) ? (
        <TextInput
          value={field.placeholder || ''}
          onChangeText={(placeholder) => onPatch(index, { placeholder })}
          placeholder="Tekst inne i feltet, slik [Dato] i malen"
          placeholderTextColor={colors.placeholder}
          style={[styles.lineInput, FACE, { color: colors.ink, borderBottomColor: colors.line }]}
        />
      ) : null}
      {['choice', 'checks', 'dropdown'].includes(field.kind) ? (
        <View style={{ gap: 6 }}>
          {(field.options || []).map((option, optionIndex) => (
            <View key={option.id} style={styles.tools}>
              <Text style={{ color: colors.muted }}>{field.kind === 'checks' ? '☐' : '○'}</Text>
              <TextInput
                value={option.label}
                onChangeText={(label) => onPatch(index, { options: field.options.map((row, i) => (i === optionIndex ? { ...row, label } : row)) })}
                placeholder={`Alternativ ${optionIndex + 1}`}
                placeholderTextColor={colors.placeholder}
                style={[styles.lineInput, FACE, { color: colors.ink, borderBottomColor: colors.line }]}
              />
              <TouchableOpacity onPress={() => onOptionImage(index, optionIndex)} accessibilityRole="button" accessibilityLabel="Bilde på alternativ">
                <Ionicons name="image-outline" size={18} color={colors.brand} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onPatch(index, { options: field.options.filter((_, i) => i !== optionIndex) })} accessibilityRole="button" accessibilityLabel="Fjern alternativ">
                <Ionicons name="close" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.tools}>
            <TouchableOpacity onPress={() => onPatch(index, { options: [...(field.options || []), { id: `${field.id}_${(field.options || []).length}`, label: '' }] })} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Legg til alternativ</Text>
            </TouchableOpacity>
            {field.kind !== 'dropdown' ? (
              <TouchableOpacity onPress={() => onPatch(index, { other: !field.other })} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>{field.other ? 'Fjern Annet' : 'Legg til Annet'}</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.switchRow}>
              <Text style={{ color: colors.ink }}>Tilfeldig rekkefølge</Text>
              <Switch value={!!field.shuffle} onValueChange={(shuffle) => onPatch(index, { shuffle })} />
            </View>
          </View>
        </View>
      ) : null}
      {field.kind === 'scale' ? (
        <View style={{ gap: 6 }}>
          <View style={styles.tools}>
            {[3, 5, 7, 10].map((n) => (
              <TouchableOpacity key={n} onPress={() => onPatch(index, { scaleMax: n })} accessibilityRole="button" style={[styles.scaleN, { backgroundColor: field.scaleMax === n ? colors.brand : colors.card }]}>
                <Text style={{ color: field.scaleMax === n ? '#fff' : colors.ink }}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput value={field.lowLabel || ''} onChangeText={(lowLabel) => onPatch(index, { lowLabel })} placeholder="Etikett for 1" placeholderTextColor={colors.placeholder} style={[styles.lineInput, FACE, { color: colors.ink, borderBottomColor: colors.line }]} />
          <TextInput value={field.highLabel || ''} onChangeText={(highLabel) => onPatch(index, { highLabel })} placeholder="Etikett for høyeste" placeholderTextColor={colors.placeholder} style={[styles.lineInput, FACE, { color: colors.ink, borderBottomColor: colors.line }]} />
        </View>
      ) : null}
      <View style={styles.tools}>
        <TouchableOpacity onPress={() => onDuplicate(index)} accessibilityRole="button" accessibilityLabel="Kopier felt"><Ionicons name="copy-outline" size={18} color={colors.muted} /></TouchableOpacity>
        <TouchableOpacity onPress={() => onMove(index, -1)} accessibilityRole="button" accessibilityLabel="Flytt opp"><Ionicons name="arrow-up" size={18} color={colors.muted} /></TouchableOpacity>
        <TouchableOpacity onPress={() => onMove(index, 1)} accessibilityRole="button" accessibilityLabel="Flytt ned" disabled={last}><Ionicons name="arrow-down" size={18} color={colors.muted} /></TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(index)} accessibilityRole="button" accessibilityLabel="Slett felt"><Ionicons name="trash-outline" size={18} color={colors.danger} /></TouchableOpacity>
      </View>
    </View>
  );
}

export default function FormDocument({
  draft,
  colors,
  mode = 'fill',
  companyLogo,
  selected = -1,
  onSelect,
  onPatch,
  onType,
  onDuplicate,
  onMove,
  onDelete,
  onOptionImage,
  onGrip,
  drag,
  fieldRefs,
  answers,
  onAnswer,
  onPickFile,
  optionsFor,
  showSubmit = false,
  email = '',
  onEmail,
  sent = false,
  sendNote = '',
  onSubmit,
  onAnother,
  onSummary,
  progress = 1,
}) {
  useDocumentFace();
  const settings = draft.settings || {};
  const editing = mode === 'edit';
  const fields = draft.fields || [];
  const model = sheetModel(fields, draft.title);
  const company = companyFrom(model.header);
  const word = wordmarkOf(company);
  const head = headerLayout(model.header);
  const foot = footerBits(model.footerLeft, model.footerRight, company);
  const grid = { borderColor: GRID };
  const wordParts = String(word || '').match(/^(.*?)(\d+)$/);

  function answerFor(field) {
    return {
      ...field,
      options: optionsFor ? optionsFor(field) : (field.options || []),
      value: answers?.[field.id] ?? (field.kind === 'check' ? false : field.kind === 'checks' ? [] : ''),
    };
  }

  function labelNode(field, index, shown) {
    const on = editing && index === selected;
    if (on) {
      return (
        <TextInput
          value={field.label}
          onChangeText={(label) => onPatch(index, { label })}
          placeholder={field.kind === 'title' ? 'Seksjon' : 'Etikett'}
          placeholderTextColor={colors.placeholder}
          style={[styles.cellEdit, FACE, { color: INK }]}
        />
      );
    }
    return (
      <Text style={[styles.cellLabel, FACE, { color: INK }]}>
        {shown || field.label || 'Felt'}{field.required ? ' *' : ''}
      </Text>
    );
  }

  function valueNode(field, prefix, baked) {
    const body = baked
      ? <Text style={[styles.cellText, FACE, { color: INK }]}>{baked}</Text>
      : editing
        ? <EditValue field={field} />
        : (
          <FormAnswer
            field={answerFor(field)}
            colors={colors}
            variant="cell"
            onChange={(next) => onAnswer(field.id, next)}
            onPickFile={() => onPickFile(field)}
          />
        );
    if (!prefix) return body;
    return (
      <View style={styles.inlineValue}>
        <Text style={[styles.prefix, FACE, { color: INK }]}>{prefix}</Text>
        <View style={{ flex: 1 }}>{body}</View>
      </View>
    );
  }

  function bindRef(index) {
    return (node) => {
      if (fieldRefs) fieldRefs.current[index] = node;
    };
  }

  function sheetCell(index, style, children, { grip = false, label = 'felt' } = {}) {
    const on = editing && index === selected;
    if (!editing) return <View style={style}>{children}</View>;
    return (
      <TouchableOpacity
        onPress={() => onSelect(index)}
        accessibilityRole="button"
        accessibilityLabel={`Rediger ${label}`}
        ref={bindRef(index)}
        style={style}
      >
        {grip && on ? (
          <View
            onPointerDown={(event) => onGrip(index, event)}
            accessibilityLabel={`Dra ${label}`}
            style={styles.grip}
          >
            <Ionicons name="reorder-three" size={14} color={colors.muted} />
          </View>
        ) : null}
        {grip ? <View style={{ flex: 1 }}>{children}</View> : children}
      </TouchableOpacity>
    );
  }

  function labelCell(field, index, flex, shown) {
    const on = editing && index === selected;
    return sheetCell(
      index,
      [styles.td, styles.th, grid, { backgroundColor: on ? colors.brandSoft : LABEL_BG, flex }],
      labelNode(field, index, shown),
      { grip: true, label: field.label || 'felt' },
    );
  }

  function valueCell(field, index, flex, prefix, baked, tall) {
    const on = editing && index === selected;
    return sheetCell(
      index,
      [styles.td, grid, tall && styles.tall, { backgroundColor: on ? colors.brandSoft : '#fff', flex }],
      valueNode(field, prefix, baked),
      { label: field.label || 'felt' },
    );
  }

  function fieldRow(items, shared) {
    if (shared) {
      const [left, right] = items;
      const face = faceOf(left.field);
      const other = faceOf(right.field);
      return (
        <View style={styles.tr}>
          {labelCell(left.field, left.index, 0.9, face.label)}
          {valueCell(left.field, left.index, 1.35, face.prefix, face.baked, left.field.kind === 'long')}
          {valueCell(right.field, right.index, 1.35, other.prefix || `${other.label}:`, other.baked, right.field.kind === 'long')}
        </View>
      );
    }
    const pair = items.length > 1;
    return (
      <View style={styles.tr}>
        {items.map(({ field, index }) => {
          const face = faceOf(field);
          const tall = field.kind === 'long' || /beskrivelse/i.test(field.label || '');
          return (
            <View key={field.id} style={[styles.tr, { flex: 1 }]}>
              {labelCell(field, index, pair ? 0.9 : 0.72, face.label)}
              {valueCell(field, index, pair ? 1.25 : 2.4, face.prefix, face.baked, tall)}
            </View>
          );
        })}
      </View>
    );
  }

  function addressBlock(items) {
    const [headItem, postItem, placeItem] = items;
    const face = faceOf(headItem.field);
    const on = editing && headItem.index === selected;
    return (
      <View style={styles.tr}>
        {sheetCell(
          headItem.index,
          [styles.td, styles.th, grid, { backgroundColor: on ? colors.brandSoft : LABEL_BG, flex: 0.72 }],
          labelNode(headItem.field, headItem.index, face.label),
          { label: headItem.field.label || 'adresse' },
        )}
        <View style={{ flex: 2.4 }}>
          {sheetCell(
            headItem.index,
            [styles.td, grid, { backgroundColor: on ? colors.brandSoft : '#fff' }],
            valueNode(headItem.field, face.prefix || 'Adresse:', face.baked),
            { label: headItem.field.label || 'adresse' },
          )}
          <View style={styles.tr}>
            {labelCell(postItem.field, postItem.index, 0.7, 'Post nr.')}
            {valueCell(postItem.field, postItem.index, 1.1, '', '')}
            {placeItem ? labelCell(placeItem.field, placeItem.index, 0.55, 'Sted') : null}
            {placeItem ? valueCell(placeItem.field, placeItem.index, 1.2, '', '') : null}
          </View>
        </View>
      </View>
    );
  }

  function blockNode(block) {
    const key = block.items.map((item) => item.field.id).join('-');
    const first = block.items[0].index;
    if (block.type === 'section') {
      const { field, index } = block.items[0];
      const on = editing && index === selected;
      return (
        <View key={key}>
          <View style={[styles.drop, drag?.active && drag.hover === index ? { height: 8, backgroundColor: colors.brand } : null]} />
          <TouchableOpacity onPress={() => editing && onSelect(index)} accessibilityRole="button" accessibilityLabel={`Rediger ${field.label || 'seksjon'}`} ref={bindRef(index)}>
            <View style={[styles.td, styles.sectionCell, grid, { backgroundColor: on ? colors.brandSoft : SECTION_BG }]}>
              {on ? (
                <TextInput value={field.label} onChangeText={(label) => onPatch(index, { label })} placeholder="Seksjon" placeholderTextColor={colors.placeholder} style={[styles.sectionLabel, FACE, { color: INK }]} />
              ) : (
                <Text style={[styles.sectionLabel, FACE, { color: INK }]}>{field.label}</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      );
    }
    if (block.type === 'prose') {
      return block.items.map(({ field, index }) => {
        const on = editing && index === selected;
        const centered = /gyldig|utferdiget|signering|begge parter/i.test(field.label || '');
        const parts = proseParts(field.label);
        return (
          <TouchableOpacity key={field.id} onPress={() => editing && onSelect(index)} accessibilityRole="button" ref={bindRef(index)}>
            <View style={[styles.td, styles.proseCell, grid, { backgroundColor: on ? colors.brandSoft : '#fff' }]}>
              {parts.head ? <Text style={[styles.proseHead, FACE, { color: INK, textAlign: centered ? 'center' : 'left' }]}>{parts.head}</Text> : null}
              <Text style={[styles.prose, FACE, { color: INK, textAlign: centered ? 'center' : 'left' }]}>{parts.head ? parts.body : field.label}</Text>
            </View>
          </TouchableOpacity>
        );
      });
    }
    if (block.type === 'sign') {
      return (
        <View key={key} style={styles.tr}>
          {block.items.map(({ field, index }) => {
            const on = editing && index === selected;
            const signed = answers?.[field.id];
            const signedName = signed && typeof signed === 'object' ? signed.name : '';
            return (
              <TouchableOpacity
                key={field.id}
                onPress={() => (editing ? onSelect(index) : onPickFile(field))}
                accessibilityRole="button"
                accessibilityLabel={editing ? `Rediger ${field.label || 'signatur'}` : `Last opp ${field.label || 'signatur'}`}
                ref={bindRef(index)}
                style={[styles.td, styles.signCell, grid, { backgroundColor: on ? colors.brandSoft : '#fff', flex: 1 }]}
              >
                <View style={styles.signCanvas}>
                  {signedName ? <Text style={[styles.signInk, SCRIPT, { color: '#1a2744' }]}>{String(signedName).replace(/\.[a-z0-9]+$/i, '')}</Text> : null}
                </View>
                <Text style={[styles.signCaption, FACE, { color: INK }]}>{field.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }
    if (block.type === 'address') {
      return (
        <View key={key}>
          <View style={[styles.drop, drag?.active && drag.hover === first ? { height: 8, backgroundColor: colors.brand } : null]} />
          {addressBlock(block.items)}
        </View>
      );
    }
    return (
      <View key={key}>
        <View style={[styles.drop, drag?.active && drag.hover === first ? { height: 8, backgroundColor: colors.brand } : null]} />
        {fieldRow(block.items, block.type === 'shared')}
      </View>
    );
  }

  const runs = [];
  model.blocks.forEach((block) => {
    if (block.type === 'columns') {
      runs.push({ type: 'columns', block });
      return;
    }
    const last = runs[runs.length - 1];
    if (last && last.type === 'table') last.blocks.push(block);
    else runs.push({ type: 'table', blocks: [block] });
  });
  if (!runs.some((run) => run.type === 'table') && !editing && settings.collectEmail) runs.unshift({ type: 'table', blocks: [] });

  function columnArticle(block) {
    const mid = Math.ceil(block.items.length / 2);
    const sides = [block.items.slice(0, mid), block.items.slice(mid)];
    return (
      <View key={block.items.map((item) => item.field.id).join('-')} style={styles.columns}>
        {sides.map((side) => (
          <View key={side[0]?.field.id || 'tom'} style={styles.column}>
            {side.map(({ field, index }) => {
              const parts = proseParts(field.label);
              const on = editing && index === selected;
              return (
                <TouchableOpacity key={field.id} onPress={() => editing && onSelect(index)} accessibilityRole="button" style={on ? { backgroundColor: colors.brandSoft } : null}>
                  {parts.head ? <Text style={[styles.columnHead, FACE, { color: INK }]}>{parts.head}</Text> : null}
                  <Text style={[styles.columnBody, FACE, { color: INK }]}>{parts.head ? parts.body : field.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  }

  const sheet = (
    <View style={[styles.paper, FACE]}>
      {draft.cover ? <Image source={{ uri: draft.cover }} style={styles.cover} /> : null}
      {model.header.length || (settings.useCompanyLogo && companyLogo?.dataUrl) || word ? (
        <View style={styles.letterhead}>
          <View style={[styles.table, grid, { flex: 1 }]}>
            {head.parsed ? (
              <>
                <View style={styles.tr}>
                  {sheetCell(
                    model.header[0]?.index ?? -1,
                    [styles.td, styles.metaCell, grid, { backgroundColor: '#fff', flex: 1.2 }],
                    <Text style={[styles.metaBrand, FACE, { color: INK }]}>{head.brand || company || 'Dokument'}</Text>,
                    { label: head.brand || 'brevhode' },
                  )}
                  {head.dates.map((pair) => (
                    <View key={pair.key} style={styles.tr}>
                      {sheetCell(
                        pair.index,
                        [styles.td, styles.metaCell, grid, { backgroundColor: editing && pair.index === selected ? colors.brandSoft : LABEL_BG }],
                        <Text style={[styles.metaKey, FACE, { color: INK }]}>{pair.key}</Text>,
                        { label: pair.key },
                      )}
                      {sheetCell(
                        pair.index,
                        [styles.td, styles.metaCell, grid, { backgroundColor: editing && pair.index === selected ? colors.brandSoft : '#fff' }],
                        <Text style={[styles.metaVal, FACE, { color: INK }]}>{pair.value}</Text>,
                        { label: pair.key },
                      )}
                    </View>
                  ))}
                </View>
                {head.rows.map((row) => (
                  <View key={row.map((pair) => pair.key).join('-')} style={styles.tr}>
                    {row.map((pair) => (
                      <View key={pair.key} style={[styles.tr, { flex: 1 }]}>
                        {sheetCell(
                          pair.index,
                          [styles.td, styles.metaCell, grid, { backgroundColor: editing && pair.index === selected ? colors.brandSoft : LABEL_BG, flex: row.length === 1 ? 0.7 : undefined }],
                          <Text style={[styles.metaKey, FACE, { color: INK }]}>{pair.key}</Text>,
                          { label: pair.key },
                        )}
                        {sheetCell(
                          pair.index,
                          [styles.td, styles.metaCell, grid, { backgroundColor: editing && pair.index === selected ? colors.brandSoft : '#fff', flex: row.length === 1 ? 2.2 : undefined }],
                          <Text style={[styles.metaVal, FACE, { color: INK }]}>{pair.value}</Text>,
                          { label: pair.value || pair.key },
                        )}
                      </View>
                    ))}
                  </View>
                ))}
              </>
            ) : model.header.map(({ field, index }, row) => {
              const on = editing && index === selected;
              return (
                <TouchableOpacity key={field.id} onPress={() => editing && onSelect(index)} accessibilityRole="button" style={[styles.metaPlain, row < model.header.length - 1 && styles.metaRule, grid, on && { backgroundColor: colors.brandSoft }]}>
                  <Text style={[row === 0 ? styles.metaBrand : styles.metaVal, FACE, { color: INK }]}>{field.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.markCol}>
            {settings.useCompanyLogo && companyLogo?.dataUrl ? (
              <Image source={{ uri: companyLogo.dataUrl }} style={styles.logo} resizeMode="contain" accessibilityLabel="Bedriftens logo" />
            ) : word ? (
              <Text style={[styles.wordmark, FACE, { color: '#243044' }]}>
                {wordParts ? wordParts[1] : word}
                {wordParts ? <Text style={styles.wordDigit}>{wordParts[2]}</Text> : null}
              </Text>
            ) : null}
            {settings.useCompanyLogo && !companyLogo?.dataUrl ? (
              <Text style={[styles.footerMuted, FACE, { color: colors.muted }]}>Logo er ikke lastet opp</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {editing ? (
        <TextInput
          value={draft.title}
          onChangeText={(title) => onPatch(-1, { title })}
          placeholder="Dokumenttittel"
          placeholderTextColor={colors.placeholder}
          style={[styles.docTitle, FACE, { color: INK }]}
        />
      ) : (
        <Text style={[styles.docTitle, FACE, { color: INK }]}>{draft.title || 'Uten navn'}</Text>
      )}
      {draft.intro ? (
        editing ? (
          <TextInput
            value={draft.intro}
            onChangeText={(intro) => onPatch(-1, { intro })}
            placeholder="Ingress"
            placeholderTextColor={colors.placeholder}
            multiline
            style={[styles.intro, FACE, { color: INK }]}
          />
        ) : <Text style={[styles.intro, FACE, { color: '#3c4654' }]}>{draft.intro}</Text>
      ) : null}
      {!editing && settings.progress ? (
        <View style={[styles.track, { backgroundColor: colors.sunken }]}>
          <View style={[styles.bar, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.brand }]} />
        </View>
      ) : null}
      {!editing && settings.requireLogin ? <Text style={[styles.footerMuted, FACE, { color: colors.muted, marginBottom: 6 }]}>Innlogging kreves for å sende inn.</Text> : null}
      {runs.map((run, runIndex) => {
        if (run.type === 'columns') return columnArticle(run.block);
        return (
          <View key={`tabell-${runIndex}`} style={[styles.table, grid]}>
            {runIndex === 0 && !editing && settings.collectEmail ? (
              <View style={styles.tr}>
                <View style={[styles.td, styles.th, grid, { backgroundColor: LABEL_BG, flex: 0.72 }]}>
                  <Text style={[styles.cellLabel, FACE, { color: INK }]}>E-post</Text>
                </View>
                <View style={[styles.td, grid, { backgroundColor: '#fff', flex: 2.4 }]}>
                  <TextInput value={email} onChangeText={onEmail} placeholder="navn@bedrift.no" placeholderTextColor={colors.placeholder} autoCapitalize="none" keyboardType="email-address" style={[styles.cellEdit, FACE, { color: INK }]} />
                </View>
              </View>
            ) : null}
            {run.blocks.map((block) => blockNode(block))}
          </View>
        );
      })}
      <View style={[styles.drop, drag?.active && drag.hover === fields.length ? { height: 8, backgroundColor: colors.brand } : null]} />
      {foot.parsed || company || model.footerLeft.length ? (
        <View style={styles.footer}>
          {foot.parsed ? (
            <>
              <View style={styles.footerCol}>
                {company ? <Text style={[styles.footerBrand, FACE, { color: INK }]}>{company}</Text> : null}
                {foot.org ? <Text style={[styles.footerLine, FACE, { color: INK }]}>{foot.org}</Text> : null}
                {foot.web ? <Text style={[styles.footerLine, FACE, { color: INK }]}>{foot.web}</Text> : null}
              </View>
              <View style={styles.footerCol}>
                {foot.phone ? <Text style={[styles.footerLine, FACE, { color: INK }]}>{foot.phone}</Text> : null}
                {foot.mail ? <Text style={[styles.footerLine, FACE, { color: INK }]}>{foot.mail}</Text> : null}
              </View>
              <View style={[styles.footerCol, { alignItems: 'flex-end' }]}>
                {foot.showPrint ? <Text style={[styles.footerMuted, FACE]}>Utskriftstidspunkt</Text> : null}
                {foot.printed ? <Text style={[styles.footerLine, FACE, { color: INK }]}>{foot.printed}</Text> : null}
                {foot.showPage ? <Text style={[styles.footerMuted, FACE]}>Sidetall</Text> : null}
                {foot.page ? <Text style={[styles.footerLine, FACE, { color: INK }]}>{foot.page}</Text> : null}
              </View>
            </>
          ) : (
            <>
              <View style={{ flex: 1, gap: 1 }}>
                {company ? <Text style={[styles.footerBrand, FACE, { color: INK }]}>{company}</Text> : null}
                {model.footerLeft.map(({ field }) => (
                  <Text key={field.id} style={[styles.footerLine, FACE, { color: INK }]}>{field.label}</Text>
                ))}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 1 }}>
                {model.footerRight.map(({ field }) => (
                  <Text key={field.id} style={[styles.footerMuted, FACE, { textAlign: 'right' }]}>{field.label}</Text>
                ))}
              </View>
            </>
          )}
        </View>
      ) : null}
      {!editing && showSubmit ? (
        <View style={styles.submitRow}>
          {sent ? <Text style={{ color: colors.brand }}>{settings.confirmation || 'Svaret er sendt.'}</Text> : null}
          {!!sendNote && <Text style={{ color: colors.danger }}>{sendNote}</Text>}
          <View style={styles.tools}>
            <TouchableOpacity onPress={onSubmit} accessibilityRole="button" style={[styles.send, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff' }}>Send inn</Text>
            </TouchableOpacity>
            {sent && settings.anotherResponse ? (
              <TouchableOpacity onPress={onAnother} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Send et annet svar</Text>
              </TouchableOpacity>
            ) : null}
            {sent && settings.showSummary ? (
              <TouchableOpacity onPress={onSummary} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Se sammendrag</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
  return (
    <View style={styles.sheetWrap}>
      {sheet}
      {editing && fields[selected] ? (
        <Inspector field={fields[selected]} index={selected} colors={colors} onPatch={onPatch} onType={() => onType(selected)} onDuplicate={onDuplicate} onMove={onMove} onDelete={onDelete} onOptionImage={onOptionImage} last={selected >= fields.length - 1} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: '#fff',
    borderWidth: 0,
    borderRadius: 0,
    paddingTop: 18,
    paddingBottom: 22,
    paddingHorizontal: 22,
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 0 1px #e4e8ee, 0 10px 28px rgba(16,24,40,0.06)' } : {}),
  },
  sheetWrap: { gap: 8 },
  letterhead: { flexDirection: 'row', alignItems: 'flex-start', gap: 18, marginBottom: 2 },
  meta: { flex: 1, borderWidth: 1, alignSelf: 'stretch' },
  metaTop: { flexDirection: 'row', alignItems: 'stretch', minHeight: 28 },
  metaBrandCell: { flex: 1, justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 3 },
  metaBrand: { fontSize: 10, fontWeight: '700', lineHeight: 13 },
  dateRow: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 1, borderLeftColor: GRID, paddingRight: 4 },
  datePair: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5 },
  metaLineRow: { flexDirection: 'row', alignItems: 'center', minHeight: 18, paddingHorizontal: 6, paddingVertical: 2, gap: 8 },
  metaPair: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaCell: { minHeight: 16, paddingHorizontal: 3, paddingVertical: 1 },
  metaKey: { fontSize: 9, lineHeight: 12, fontWeight: '700' },
  metaVal: { fontSize: 9, lineHeight: 12, fontWeight: '400' },
  metaRule: { borderBottomWidth: 1 },
  metaPlain: { paddingHorizontal: 6, paddingVertical: 3 },
  markCol: { width: 148, minHeight: 58, alignItems: 'flex-end', justifyContent: 'center' },
  logo: { width: 148, height: 52 },
  wordmark: { fontSize: 28, fontWeight: '700', letterSpacing: -0.8, lineHeight: 32 },
  wordDigit: { fontSize: 30, letterSpacing: -1 },
  cover: { width: '100%', height: 72, marginBottom: 10 },
  docTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.2, marginTop: 16, marginBottom: 10, paddingVertical: 0 },
  intro: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  table: { borderTopWidth: 1, borderLeftWidth: 1, marginBottom: 0 },
  tr: { flexDirection: 'row', alignItems: 'stretch' },
  td: { borderRightWidth: 1, borderBottomWidth: 1, paddingHorizontal: 7, paddingVertical: 4, minHeight: 26, justifyContent: 'center' },
  th: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tall: { minHeight: 72, alignItems: 'flex-start', justifyContent: 'flex-start' },
  sectionCell: { minHeight: 28, paddingVertical: 5 },
  cellLabel: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  cellEdit: { fontSize: 12, lineHeight: 16, paddingVertical: 0, paddingHorizontal: 0, flex: 1 },
  cellText: { fontSize: 12, lineHeight: 16 },
  ghost: { fontSize: 12, lineHeight: 16 },
  ghostSpace: { minHeight: 16 },
  prefix: { fontSize: 12, lineHeight: 16, marginRight: 6 },
  inlineValue: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  sectionLabel: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  proseCell: { paddingVertical: 7, paddingHorizontal: 8 },
  prose: { fontSize: 11.5, lineHeight: 16 },
  proseHead: { fontSize: 11.5, lineHeight: 16, fontWeight: '700', marginBottom: 2 },
  columns: { flexDirection: 'row', gap: 22, paddingTop: 8, paddingBottom: 4 },
  column: { flex: 1, gap: 10 },
  columnHead: { fontSize: 11.5, lineHeight: 15, fontWeight: '700' },
  columnBody: { fontSize: 11, lineHeight: 15 },
  marks: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
  markItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  box: { width: 11, height: 11, borderWidth: 1, borderRadius: 1, backgroundColor: '#fff' },
  boxRound: { borderRadius: 6 },
  signCell: { minHeight: 108, justifyContent: 'flex-end', alignItems: 'center', paddingTop: 8, paddingBottom: 8, gap: 6 },
  signCanvas: { flex: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  signInk: { fontSize: 26, lineHeight: 30 },
  signCaption: { fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: 18, marginTop: 18, paddingTop: 2 },
  footerCol: { flex: 1, gap: 1 },
  footerBrand: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  footerLine: { fontSize: 10, lineHeight: 14 },
  footerMuted: { fontSize: 10, lineHeight: 14, color: '#5c6775' },
  submitRow: { marginTop: 16, gap: 8 },
  drop: { overflow: 'hidden' },
  inspector: { marginTop: 10, marginBottom: 8, padding: 8, borderRadius: 8, gap: 8 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineInput: { flex: 1, minWidth: 120, borderBottomWidth: 1, paddingVertical: 4, fontSize: 14 },
  grip: { width: 18, height: 22, alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none' },
  scaleN: { minWidth: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  send: { borderRadius: 4, paddingHorizontal: 14, paddingVertical: 8 },
  track: { height: 3, borderRadius: 99, overflow: 'hidden', marginBottom: 8 },
  bar: { height: 3 },
});
