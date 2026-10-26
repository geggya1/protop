import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fieldType, hasDocInfo, isAnswerField, normalizeDocInfo } from '../../src/anbud/formBuilder';
import { TOKENS } from '../../src/forms/tokens';
import { HeaderGrid, StatusChip } from '../doccontrol/parts';
import FormTableEditor from './FormTableEditor';

function chromeNote(field) {
  return field?.kind === 'note' && /ledelsessystem|dokument\s*(navn|id)|dokumenteier|godkjent av|\bversjon\b|org\.\s*\d|sentralbord|utskriftstidspunkt|\bsidetall\b|\bwww\.|^web:|e-?post:/i.test(field.label || '');
}

function sameTitle(left, right) {
  return String(left || '').trim().toLocaleLowerCase('nb-NO') === String(right || '').trim().toLocaleLowerCase('nb-NO');
}

function modelOf(fields, title) {
  const info = [];
  const body = [];
  (fields || []).forEach((field, index) => {
    const item = { field, index };
    if (chromeNote(field) || (field.kind === 'title' && sameTitle(field.label, title))) info.push(item);
    else body.push(item);
  });
  const sections = [];
  let current = { title: null, items: [] };
  body.forEach((item) => {
    if (item.field.kind === 'title') {
      if (current.title || current.items.length) sections.push(current);
      current = { title: item, items: [] };
      return;
    }
    current.items.push(item);
  });
  if (current.title || current.items.length) sections.push(current);
  return { info, sections };
}

function rowsOf(items) {
  const rows = [];
  for (let i = 0; i < items.length; i += 1) {
    const next = items[i + 1];
    const pair = next
      && items[i].field.width === 'half'
      && next.field.width === 'half'
      && isAnswerField(items[i].field)
      && isAnswerField(next.field);
    if (pair) {
      rows.push([items[i], next]);
      i += 1;
    } else rows.push([items[i]]);
  }
  return rows;
}

function hintOf(field) {
  if (field.kind === 'note') return '';
  if (field.kind === 'table') {
    const rows = (field.rows || []).filter((row) => !row.group).length;
    return `${(field.columns || []).map((col) => col.label).filter(Boolean).join(' · ') || 'Ingen kolonner'} · ${rows} ${rows === 1 ? 'rad' : 'rader'}`;
  }
  if (field.kind === 'sign') return 'Signeres digitalt med navn og tid';
  if (field.kind === 'checks' || field.kind === 'choice' || field.kind === 'dropdown') {
    const labels = (field.options || []).map((option) => option.label).filter(Boolean);
    return labels.join(' · ') || 'Ingen alternativer';
  }
  if (field.placeholder) return field.placeholder.startsWith('[') ? field.placeholder : `[${field.placeholder}]`;
  if (field.kind === 'date') return '[Dato]';
  if (field.kind === 'time') return '[TT:MM]';
  if (field.kind === 'long') return 'Lengre tekst';
  if (field.kind === 'image' && /signatur|underskrift/i.test(field.label || '')) return 'Signatur';
  const hint = fieldType(field.kind).hint;
  return field.editor === 'fast' ? `${hint} · Låst` : hint;
}

function MarkBox({ on, colors, label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} style={[styles.mark, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : colors.card }]}>
      {on ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
    </TouchableOpacity>
  );
}

function FieldCard({ item, colors, selected, marked, onSelect, onPatch, onType, onDelete, onToggle, onMove, onDuplicate, onOptionImage, last }) {
  const { field, index } = item;
  const on = selected;
  const meta = fieldType(field.kind);
  if (field.kind === 'title') {
    return (
      <View style={styles.sectionHead}>
        <MarkBox on={marked} colors={colors} label={`Merk ${field.label || 'seksjon'}`} onPress={() => onToggle(field.id)} />
        <TextInput
          value={field.label}
          onFocus={() => onSelect(index)}
          onChangeText={(label) => onPatch(index, { label })}
          placeholder="Seksjon"
          placeholderTextColor={colors.placeholder}
          style={[styles.sectionTitle, { color: colors.ink }]}
        />
        <TouchableOpacity onPress={() => onDelete(index)} accessibilityRole="button" accessibilityLabel={`Slett ${field.label || 'seksjon'}`}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
        {on ? (
          <View style={styles.head}>
            <TouchableOpacity onPress={() => onMove(index, -1)} accessibilityRole="button" accessibilityLabel="Flytt opp"><Ionicons name="arrow-up" size={18} color={colors.muted} /></TouchableOpacity>
            <TouchableOpacity onPress={() => onMove(index, 1)} disabled={last} accessibilityRole="button" accessibilityLabel="Flytt ned"><Ionicons name="arrow-down" size={18} color={colors.muted} /></TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: on ? colors.brand : colors.line }]}>
      <View style={styles.head}>
        <MarkBox on={marked} colors={colors} label={`Merk ${field.label || 'felt'}`} onPress={() => onToggle(field.id)} />
        {field.kind === 'note' && !on ? (
          <TouchableOpacity onPress={() => onSelect(index)} accessibilityRole="button" style={{ flex: 1 }}>
            <Text style={[styles.note, { color: colors.ink }]} numberOfLines={2}>{field.label || 'Tekst'}</Text>
          </TouchableOpacity>
        ) : (
          <TextInput
            value={field.label}
            onFocus={() => onSelect(index)}
            onChangeText={(label) => onPatch(index, { label })}
            placeholder={field.kind === 'note' ? 'Tekst' : 'Feltnavn'}
            placeholderTextColor={colors.placeholder}
            multiline={field.kind === 'note'}
            style={[styles.label, { color: colors.ink }]}
          />
        )}
        {isAnswerField(field) ? (
          <TouchableOpacity onPress={() => onType(index)} accessibilityRole="button" accessibilityLabel="Velg felttype" style={[styles.chip, { backgroundColor: colors.sunken }]}>
            <Text style={{ color: colors.ink, fontSize: 12 }}>{meta.label}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => onDelete(index)} accessibilityRole="button" accessibilityLabel={`Slett ${field.label || 'felt'}`}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      </View>
      {field.kind !== 'note' && !on ? (
        <Text style={[styles.hint, { color: colors.placeholder }]}>{hintOf(field)}</Text>
      ) : null}
      {on ? (
        <View style={{ gap: 8 }}>
          {field.review ? (
            <View style={styles.head}>
              <Text style={{ color: '#9a6700', flex: 1 }}>{field.review}</Text>
              <TouchableOpacity onPress={() => onPatch(index, { review: '' })} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Ferdig</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {isAnswerField(field) ? (
            <View style={[styles.head, { flexWrap: 'wrap' }]}>
              <Text style={{ color: colors.ink }}>Obligatorisk</Text>
              <Switch value={!!field.required} onValueChange={(required) => onPatch(index, { required })} />
              {field.kind !== 'table' ? (
                <>
                  <Text style={{ color: colors.ink }}>{field.width === 'half' ? 'Ved siden av' : 'Egen linje'}</Text>
                  <Switch value={field.width === 'half'} onValueChange={(half) => onPatch(index, { width: half ? 'half' : 'full' })} />
                </>
              ) : null}
              <Text style={{ color: colors.ink }}>Låst</Text>
              <Switch value={field.editor === 'fast'} onValueChange={(locked) => onPatch(index, { editor: locked ? 'fast' : 'avsender' })} />
            </View>
          ) : null}
          {field.kind === 'table' ? (
            <FormTableEditor field={field} colors={colors} onPatch={(part) => onPatch(index, part)} />
          ) : null}
          {isAnswerField(field) && field.editor === 'fast' && !['choice', 'checks', 'dropdown', 'scale', 'image', 'file', 'table', 'sign'].includes(field.kind) ? (
            field.kind === 'check' ? (
              <View style={styles.head}>
                <Text style={{ color: colors.ink }}>Avkrysset</Text>
                <Switch value={!!field.value} onValueChange={(value) => onPatch(index, { value })} />
              </View>
            ) : (
              <TextInput
                value={field.value == null ? '' : String(field.value)}
                onChangeText={(value) => onPatch(index, { value })}
                placeholder="Fast tekst. Kan ikke endres ved utfylling."
                placeholderTextColor={colors.placeholder}
                style={[styles.line, { color: colors.ink, borderBottomColor: colors.line }]}
              />
            )
          ) : null}
          {isAnswerField(field) && ['table', 'sign'].includes(field.kind) ? (
            <TextInput
              value={field.help || ''}
              onChangeText={(help) => onPatch(index, { help })}
              placeholder="Hjelpetekst under feltet"
              placeholderTextColor={colors.placeholder}
              style={[styles.line, { color: colors.ink, borderBottomColor: colors.line }]}
            />
          ) : null}
          {isAnswerField(field) && !['check', 'choice', 'checks', 'dropdown', 'scale', 'image', 'file', 'table', 'sign'].includes(field.kind) ? (
            <TextInput
              value={field.placeholder || ''}
              onChangeText={(placeholder) => onPatch(index, { placeholder })}
              placeholder="Hjelpetekst i feltet, for eksempel Dato"
              placeholderTextColor={colors.placeholder}
              style={[styles.line, { color: colors.ink, borderBottomColor: colors.line }]}
            />
          ) : null}
          {['choice', 'checks', 'dropdown'].includes(field.kind) ? (
            <View style={{ gap: 6 }}>
              {(field.options || []).map((option, optionIndex) => (
                <View key={option.id} style={styles.head}>
                  <Text style={{ color: colors.muted }}>{field.kind === 'checks' ? '☐' : '○'}</Text>
                  <TextInput
                    value={option.label}
                    onChangeText={(label) => onPatch(index, { options: field.options.map((row, i) => (i === optionIndex ? { ...row, label } : row)) })}
                    placeholder={`Alternativ ${optionIndex + 1}`}
                    placeholderTextColor={colors.placeholder}
                    style={[styles.line, { color: colors.ink, borderBottomColor: colors.line }]}
                  />
                  <TouchableOpacity onPress={() => onOptionImage(index, optionIndex)} accessibilityRole="button" accessibilityLabel="Bilde på alternativ">
                    <Ionicons name="image-outline" size={18} color={colors.brand} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onPatch(index, { options: field.options.filter((_, i) => i !== optionIndex) })} accessibilityRole="button" accessibilityLabel="Fjern alternativ">
                    <Ionicons name="close" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity onPress={() => onPatch(index, { options: [...(field.options || []), { id: `${field.id}_${(field.options || []).length}`, label: '' }] })} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Legg til alternativ</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <View style={styles.head}>
            <TouchableOpacity onPress={() => onDuplicate(index)} accessibilityRole="button" accessibilityLabel="Kopier felt"><Ionicons name="copy-outline" size={18} color={colors.muted} /></TouchableOpacity>
            <TouchableOpacity onPress={() => onMove(index, -1)} accessibilityRole="button" accessibilityLabel="Flytt opp"><Ionicons name="arrow-up" size={18} color={colors.muted} /></TouchableOpacity>
            <TouchableOpacity onPress={() => onMove(index, 1)} disabled={last} accessibilityRole="button" accessibilityLabel="Flytt ned"><Ionicons name="arrow-down" size={18} color={last ? colors.line : colors.muted} /></TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Dokumenthodet (KS) beregnes av dokumentstyringen: dokument-ID, versjon, eier,
 * godkjent av og datoer. Det kan ikke skrives inn for hånd.
 */
function DocHeadView({ header, status, colors }) {
  const [open, setOpen] = useState(false);
  const info = normalizeDocInfo(header);
  const used = hasDocInfo(info);
  return (
    <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <TouchableOpacity onPress={() => setOpen((value) => !value)} accessibilityRole="button" style={styles.head}>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.muted} />
        <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>Dokumenthode (KS)</Text>
        {status ? <StatusChip status={status} colors={colors} /> : <Text style={{ color: colors.muted }}>{used ? `Versjon ${info.version || '–'}` : 'Ikke styrt'}</Text>}
      </TouchableOpacity>
      {open ? (
        <View style={{ gap: 8 }}>
          {used ? <HeaderGrid header={info} colors={colors} /> : null}
          <Text style={[styles.hint, { color: colors.muted, marginLeft: 0 }]}>
            {used
              ? 'Fylles ut av dokumentstyringen og står øverst på hver side i PDF. Ny versjon får nytt nummer når den er godkjent. Send til godkjenning nederst.'
              : 'Ta malen inn i dokumentstyringen nederst for å få dokument-ID, versjon og godkjenning i hodet.'}
          </Text>
          <Text style={[styles.hint, { color: colors.muted, marginLeft: 0 }]}>
            Flettefelt i all tekst: {TOKENS.map((row) => `{{${row.key}}}`).join(' ')}. De fylles fra bedriftsprofilen.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function FormEditor({
  draft,
  colors,
  selected,
  onSelect,
  onPatch,
  onType,
  onDuplicate,
  onMove,
  onDelete,
  onDeleteIds,
  onAdd,
  onOptionImage,
  docHead = null,
  docStatus = null,
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [marked, setMarked] = useState([]);
  const fields = draft.fields || [];
  const model = modelOf(fields, draft.title);
  const showInfo = infoOpen || model.info.some((item) => item.index === selected);

  function toggle(id) {
    setMarked((current) => (current.includes(id) ? current.filter((row) => row !== id) : [...current, id]));
  }

  function card(item) {
    return (
      <FieldCard
        key={item.field.id}
        item={item}
        colors={colors}
        selected={item.index === selected}
        marked={marked.includes(item.field.id)}
        onSelect={onSelect}
        onPatch={onPatch}
        onType={onType}
        onDelete={onDelete}
        onToggle={toggle}
        onMove={onMove}
        onDuplicate={onDuplicate}
        onOptionImage={onOptionImage}
        last={item.index >= fields.length - 1}
      />
    );
  }

  return (
    <View style={styles.column}>
      <TextInput
        value={draft.title}
        onChangeText={(title) => onPatch(-1, { title })}
        placeholder="Navn på skjemaet"
        placeholderTextColor={colors.placeholder}
        style={[styles.title, { color: colors.ink }]}
      />
      <TextInput
        value={draft.intro || ''}
        onChangeText={(intro) => onPatch(-1, { intro })}
        placeholder="Kort ingress, valgfritt"
        placeholderTextColor={colors.placeholder}
        style={[styles.intro, { color: colors.ink, borderBottomColor: colors.line }]}
      />
      <DocHeadView header={docHead || draft.doc} status={docStatus} colors={colors} />
      {model.info.length ? (
        <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <TouchableOpacity onPress={() => setInfoOpen((open) => !open)} accessibilityRole="button" style={styles.head}>
            <Ionicons name={showInfo ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.muted} />
            <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>Dokumentopplysninger</Text>
            <Text style={{ color: colors.muted }}>{model.info.length}</Text>
          </TouchableOpacity>
          {showInfo ? model.info.map((item) => card(item)) : (
            <Text style={[styles.hint, { color: colors.muted }]}>Brevhode, dokument-id og sidefot. De skrives ut i PDF, og kan slettes her.</Text>
          )}
        </View>
      ) : null}
      {model.sections.map((section) => {
        const insertAt = section.items.length
          ? section.items[section.items.length - 1].index + 1
          : (section.title ? section.title.index + 1 : fields.length);
        return (
          <View key={section.title?.field.id || `lopende-${section.items[0]?.field.id || 'tom'}`} style={{ gap: 8 }}>
            {section.title ? card(section.title) : null}
            {rowsOf(section.items).map((row) => (
              <View key={row.map((item) => item.field.id).join('-')} style={row.length > 1 ? styles.pair : undefined}>
                {row.map((item) => (
                  <View key={item.field.id} style={row.length > 1 ? styles.pairItem : undefined}>
                    {card(item)}
                  </View>
                ))}
              </View>
            ))}
            <TouchableOpacity onPress={() => onAdd(insertAt)} accessibilityRole="button" accessibilityLabel="Legg til felt" style={[styles.add, { borderColor: colors.line }]}>
              <Ionicons name="add" size={16} color={colors.brand} />
              <Text style={{ color: colors.brand }}>Legg til felt</Text>
            </TouchableOpacity>
          </View>
        );
      })}
      {!model.sections.length ? (
        <TouchableOpacity onPress={() => onAdd(fields.length)} accessibilityRole="button" style={[styles.add, { borderColor: colors.line }]}>
          <Ionicons name="add" size={16} color={colors.brand} />
          <Text style={{ color: colors.brand }}>Legg til felt</Text>
        </TouchableOpacity>
      ) : null}
      {marked.length ? (
        <View style={[styles.bulk, { backgroundColor: colors.card, borderColor: colors.brand, position: 'sticky', bottom: 12, zIndex: 4 }]}>
          <Text style={{ color: colors.ink, flex: 1 }}>{marked.length} merket</Text>
          <TouchableOpacity onPress={() => setMarked([])} accessibilityRole="button">
            <Text style={{ color: colors.muted }}>Fjern merking</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              const ids = new Set(marked);
              onDeleteIds(fields.map((field, index) => (ids.has(field.id) ? index : -1)).filter((index) => index >= 0));
              setMarked([]);
            }}
            accessibilityRole="button"
          >
            <Text style={{ color: colors.danger }}>Slett merkede</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 860, alignSelf: 'center', gap: 12, paddingBottom: 28 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4, paddingVertical: 0 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  sectionTitle: { flex: 1, fontSize: 20, fontWeight: '700', paddingVertical: 2 },
  intro: { fontSize: 15, lineHeight: 21, borderBottomWidth: 1, paddingVertical: 4 },
  group: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' },
  pairItem: { flexGrow: 1, flexBasis: 280, minWidth: 240 },
  card: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flex: 1, fontSize: 16, fontWeight: '600', paddingVertical: 2, minWidth: 80 },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  hint: { fontSize: 13, lineHeight: 18, marginLeft: 28 },
  note: { fontSize: 14, lineHeight: 20 },
  line: { flex: 1, minWidth: 80, borderBottomWidth: 1, paddingVertical: 4, fontSize: 15 },
  mark: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  bulk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
