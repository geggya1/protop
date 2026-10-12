import React from 'react';
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

function signatureField(field) {
  return field?.kind === 'image' && /signatur|underskrift/i.test(`${field.label || ''} ${field.review || ''}`);
}

function documentRows(fields) {
  const rows = [];
  const list = Array.isArray(fields) ? fields : [];
  for (let index = 0; index < list.length; index += 1) {
    const field = list[index];
    const next = list[index + 1];
    const block = ['title', 'note', 'long'].includes(field.kind) || signatureField(field);
    const nextBlock = next && (['title', 'note', 'long'].includes(next.kind) || signatureField(next));
    if (!block && !nextBlock && field.width === 'half' && next?.width === 'half') {
      rows.push([{ field, index }, { field: next, index: index + 1 }]);
      index += 1;
    } else rows.push([{ field, index }]);
  }
  return rows;
}

function Blank({ field, colors, editing, onLabel }) {
  const stacked = String(field.label || '').length > 22 || field.kind === 'long';
  const line = field.kind === 'long' ? (
    <View style={[styles.area, { borderColor: colors.line }]}>
      <Text style={{ color: colors.placeholder }}>{field.placeholder || 'Skriv her'}</Text>
    </View>
  ) : (
    <View style={[styles.rule, { borderBottomColor: colors.ink }]}>
      <Text style={{ color: colors.placeholder }} numberOfLines={1}>{field.placeholder || ' '}</Text>
    </View>
  );
  const labelNode = editing ? (
    <TextInput
      value={field.label}
      onChangeText={onLabel}
      placeholder={field.kind === 'title' ? 'Seksjon' : field.kind === 'note' ? 'Tekst i dokumentet' : 'Etikett'}
      placeholderTextColor={colors.placeholder}
      multiline={field.kind === 'note' || field.kind === 'long'}
      style={[field.kind === 'title' ? styles.sectionInput : styles.labelInput, { color: colors.ink, borderBottomColor: colors.brand }]}
    />
  ) : (
    <Text style={[field.kind === 'title' ? styles.section : styles.label, { color: colors.ink, borderBottomColor: colors.line }, stacked || field.kind !== 'text' && field.kind !== 'date' && field.kind !== 'time' && field.kind !== 'number' ? null : styles.labelSide]}>
      {field.label || 'Felt'}{field.required ? ' *' : ''}
    </Text>
  );
  if (field.kind === 'title') return labelNode;
  if (field.kind === 'note') {
    return editing ? labelNode : <Text style={[styles.note, { color: colors.ink }]}>{field.label}</Text>;
  }
  if (signatureField(field)) {
    return (
      <View style={styles.signature}>
        <View style={[styles.signLine, { borderBottomColor: colors.ink }]} />
        {labelNode}
      </View>
    );
  }
  if (field.kind === 'check') {
    return (
      <View style={styles.checkRow}>
        <Text style={{ color: colors.ink }}>☐</Text>
        {labelNode}
      </View>
    );
  }
  if (['choice', 'checks', 'dropdown'].includes(field.kind)) {
    const mark = field.kind === 'checks' ? '☐' : '○';
    return (
      <View style={{ gap: 4 }}>
        {labelNode}
        <View style={styles.options}>
          {(field.options || []).map((option) => (
            <Text key={option.id} style={{ color: colors.ink }}>{mark} {option.label || 'Alternativ'}</Text>
          ))}
          {field.other ? <Text style={{ color: colors.muted }}>○ Annet</Text> : null}
        </View>
      </View>
    );
  }
  return (
    <View style={stacked ? { gap: 2 } : styles.blankRow}>
      {labelNode}
      {line}
    </View>
  );
}

function Inspector({ field, index, colors, onPatch, onType, onDuplicate, onMove, onDelete, onOptionImage, last }) {
  const meta = fieldType(field.kind);
  return (
    <View style={[styles.inspector, { backgroundColor: colors.sunken }]}>
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
        {field.kind !== 'title' && field.kind !== 'note' ? (
          <View style={styles.tools}>
            {[
              ['fast', 'Fast'],
              ['avsender', 'Avsender'],
              ['motpart', 'Motpart'],
              ['begge', 'Begge'],
            ].map(([id, label]) => {
              const on = (field.editor || 'avsender') === id;
              return (
                <TouchableOpacity key={id} onPress={() => onPatch(index, { editor: id })} accessibilityRole="button" style={[styles.chip, { backgroundColor: on ? colors.brand : colors.card }]}>
                  <Text style={{ color: on ? '#fff' : colors.ink }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
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
          style={[styles.lineInput, { color: colors.ink, borderBottomColor: colors.line }]}
        />
      ) : null}
      {field.kind !== 'title' && field.kind !== 'note' && !['check', 'choice', 'checks', 'dropdown', 'scale', 'image', 'file'].includes(field.kind) ? (
        <TextInput
          value={field.placeholder || ''}
          onChangeText={(placeholder) => onPatch(index, { placeholder })}
          placeholder="Tekst inne i feltet, slik [Dato] i malen"
          placeholderTextColor={colors.placeholder}
          style={[styles.lineInput, { color: colors.ink, borderBottomColor: colors.line }]}
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
                style={[styles.lineInput, { color: colors.ink, borderBottomColor: colors.line }]}
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
          <TextInput value={field.lowLabel || ''} onChangeText={(lowLabel) => onPatch(index, { lowLabel })} placeholder="Etikett for 1" placeholderTextColor={colors.placeholder} style={[styles.lineInput, { color: colors.ink, borderBottomColor: colors.line }]} />
          <TextInput value={field.highLabel || ''} onChangeText={(highLabel) => onPatch(index, { highLabel })} placeholder="Etikett for høyeste" placeholderTextColor={colors.placeholder} style={[styles.lineInput, { color: colors.ink, borderBottomColor: colors.line }]} />
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
  const settings = draft.settings || {};
  const editing = mode === 'edit';
  const fields = draft.fields || [];
  const rows = documentRows(fields);
  return (
    <View style={[styles.paper, { backgroundColor: colors.card, borderColor: colors.line }]}>
      {settings.useCompanyLogo && companyLogo?.dataUrl ? (
        <Image source={{ uri: companyLogo.dataUrl }} style={styles.logo} resizeMode="contain" accessibilityLabel="Bedriftens logo" />
      ) : null}
      {settings.useCompanyLogo && !companyLogo?.dataUrl ? (
        <Text style={[styles.note, { color: colors.muted }]}>Logoen er valgt, men ikke lastet opp i bedriftsinnstillingene.</Text>
      ) : null}
      {draft.cover ? <Image source={{ uri: draft.cover }} style={styles.cover} /> : null}
      {editing ? (
        <TextInput
          value={draft.title}
          onChangeText={(title) => onPatch(-1, { title })}
          placeholder="Navn på dokumentet"
          placeholderTextColor={colors.placeholder}
          style={[styles.docTitle, { color: colors.ink, borderBottomColor: colors.ink }]}
        />
      ) : (
        <Text style={[styles.docTitle, { color: colors.ink, borderBottomColor: colors.ink }]}>{draft.title || 'Uten navn'}</Text>
      )}
      {editing ? (
        <View style={styles.tools}>
          {[
            ['skjema', 'Skjema'],
            ['avtale', 'Avtalemal'],
          ].map(([id, label]) => {
            const on = (draft.category || 'skjema') === id;
            return (
              <TouchableOpacity key={id} onPress={() => onPatch(-1, { category: id })} accessibilityRole="button" style={[styles.chip, { backgroundColor: on ? colors.brand : colors.card }]}>
                <Text style={{ color: on ? '#fff' : colors.ink }}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      {editing ? (
        <TextInput
          value={draft.intro}
          onChangeText={(intro) => onPatch(-1, { intro })}
          placeholder="Kort ingress, valgfritt"
          placeholderTextColor={colors.placeholder}
          multiline
          style={[styles.intro, { color: colors.ink }]}
        />
      ) : (draft.intro ? <Text style={[styles.intro, { color: colors.muted }]}>{draft.intro}</Text> : null)}
      {!editing && settings.progress ? (
        <View style={[styles.track, { backgroundColor: colors.sunken }]}>
          <View style={[styles.bar, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.brand }]} />
        </View>
      ) : null}
      {!editing && settings.requireLogin ? <Text style={{ color: colors.muted }}>Innlogging kreves for å sende inn.</Text> : null}
      {!editing && settings.collectEmail ? (
        <View style={styles.blankRow}>
          <Text style={[styles.label, styles.labelSide, { color: colors.ink }]}>E-post</Text>
          <TextInput value={email} onChangeText={onEmail} placeholder="navn@bedrift.no" placeholderTextColor={colors.placeholder} autoCapitalize="none" keyboardType="email-address" style={[styles.answer, { color: colors.ink, borderBottomColor: colors.ink }]} />
        </View>
      ) : null}
      {rows.map((row) => (
        <View key={row.map((item) => item.field.id).join('-')} style={row.length > 1 ? styles.pair : undefined}>
          {row.map(({ field, index }) => {
            const on = editing && index === selected;
            return (
              <View key={field.id} style={row.length > 1 ? styles.pairItem : undefined}>
                <View style={[styles.drop, drag?.active && drag.hover === index ? { height: 28, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.brandSoft } : null]}>
                  {drag?.hover === index ? <Text style={{ color: colors.brand, fontSize: 12 }}>Slipp feltet her</Text> : null}
                </View>
                <View
                  ref={(node) => { if (fieldRefs) fieldRefs.current[index] = node; }}
                  style={[styles.line, on && { borderLeftColor: colors.brand, backgroundColor: colors.brandSoft }]}
                >
                  {editing ? (
                    <View style={styles.editHead}>
                      {on ? (
                        <View
                          onPointerDown={(event) => onGrip(index, event)}
                          accessibilityRole="button"
                          accessibilityLabel={`Dra ${field.label || 'felt'}`}
                          style={[styles.grip, { backgroundColor: colors.card }]}
                        >
                          <Ionicons name="reorder-three" size={16} color={colors.muted} />
                        </View>
                      ) : null}
                      <View style={{ flex: 1 }}>
                        {on ? (
                          <Blank field={field} colors={colors} editing onLabel={(label) => onPatch(index, { label })} />
                        ) : (
                          <TouchableOpacity onPress={() => onSelect(index)} accessibilityRole="button" accessibilityLabel={`Rediger ${field.label || 'felt'}`}>
                            <Blank field={field} colors={colors} editing={false} onLabel={() => {}} />
                            {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ) : (
                    <FormAnswer
                      field={{
                        ...field,
                        options: optionsFor ? optionsFor(field) : (field.options || []),
                        value: answers?.[field.id] ?? (field.kind === 'check' ? false : field.kind === 'checks' ? [] : ''),
                      }}
                      colors={colors}
                      variant="document"
                      onChange={(next) => onAnswer(field.id, next)}
                      onPickFile={() => onPickFile(field)}
                    />
                  )}
                  {on ? (
                    <Inspector
                      field={field}
                      index={index}
                      colors={colors}
                      onPatch={onPatch}
                      onType={() => onType(index)}
                      onDuplicate={onDuplicate}
                      onMove={onMove}
                      onDelete={onDelete}
                      onOptionImage={onOptionImage}
                      last={index >= fields.length - 1}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ))}
      <View style={[styles.drop, drag?.active && drag.hover === fields.length ? { height: 28, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.brandSoft } : null]}>
        {drag?.hover === fields.length ? <Text style={{ color: colors.brand, fontSize: 12 }}>Slipp feltet her</Text> : null}
      </View>
      {!editing && showSubmit ? (
        <View style={{ gap: 8, marginTop: 16 }}>
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
}

const styles = StyleSheet.create({
  paper: {
    borderWidth: 1,
    borderRadius: 2,
    paddingVertical: 28,
    paddingHorizontal: 26,
    gap: 2,
    ...(Platform.OS === 'web' ? { boxShadow: '0 1px 2px rgba(16,24,40,0.05), 0 12px 32px rgba(16,24,40,0.08)' } : {}),
  },
  logo: { width: 168, height: 48, alignSelf: 'flex-start', marginBottom: 8 },
  cover: { width: '100%', height: 120, marginBottom: 8 },
  docTitle: { fontSize: 22, fontWeight: '700', letterSpacing: 0.2, borderBottomWidth: 2, paddingBottom: 8, marginBottom: 8 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 8, minHeight: 22 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', borderBottomWidth: 1, paddingBottom: 4, marginTop: 14, marginBottom: 4 },
  sectionInput: { fontSize: 12, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', borderBottomWidth: 1, paddingBottom: 4, marginTop: 8 },
  note: { fontSize: 13, lineHeight: 19, paddingVertical: 3 },
  label: { fontSize: 13, lineHeight: 18 },
  labelSide: { maxWidth: '46%', flexShrink: 1 },
  labelInput: { fontSize: 13, borderBottomWidth: 1, paddingVertical: 2, marginBottom: 2 },
  blankRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, minHeight: 32, paddingVertical: 3 },
  rule: { flex: 1, minWidth: 72, borderBottomWidth: 1, minHeight: 22, justifyContent: 'flex-end' },
  area: { borderWidth: 1, minHeight: 64, padding: 8, marginTop: 4 },
  answer: { flex: 1, borderBottomWidth: 1, fontSize: 14, paddingVertical: 2 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  signature: { marginTop: 10, maxWidth: 260, gap: 4 },
  signLine: { height: 36, borderBottomWidth: 1 },
  help: { fontSize: 12, lineHeight: 16 },
  pair: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  pairItem: { flex: 1, minWidth: 120 },
  line: { borderLeftWidth: 3, borderLeftColor: 'transparent', paddingLeft: 8, paddingVertical: 2 },
  editHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  drop: { borderRadius: 4, borderWidth: 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  inspector: { marginTop: 6, padding: 8, borderRadius: 8, gap: 8 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineInput: { flex: 1, minWidth: 120, borderBottomWidth: 1, paddingVertical: 4, fontSize: 14 },
  grip: { width: 24, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none' },
  scaleN: { minWidth: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  send: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  track: { height: 6, borderRadius: 99, overflow: 'hidden', marginVertical: 8 },
  bar: { height: 6 },
});
