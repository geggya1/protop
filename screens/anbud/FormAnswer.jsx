import React from 'react';
import { Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { fieldType, needsInput } from '../../src/anbud/formBuilder';
import { FOCUS_FIELD_BG, FOCUS_FIELD_BORDER, FOCUS_FIELD_INK } from '../../src/forms/highlight';
import FormTableAnswer from './FormTableAnswer';
import OptionPicker, { CHIP_LIMIT } from '../../components/OptionPicker';

const FACE = Platform.OS === 'web' ? { fontFamily: 'Carlito, Calibri, "Segoe UI", Helvetica, Arial, sans-serif' } : null;

function signatureField(field) {
  return field?.kind === 'image' && /signatur|underskrift/i.test(`${field.label || ''} ${field.review || ''}`);
}

/** Fem eller flere valg (uten bilder) vises som nedtrekk med den felles velgeren. */
function listPicker(field) {
  const options = field?.options || [];
  return options.length > CHIP_LIMIT && !options.some((row) => row.image);
}

/** Valgfelt som nedtrekk. «Annet»-teksten (other:…) beholdes utenfor velgeren. */
function ChoicePicker({ field, onChange, small = false }) {
  const many = field.kind === 'checks';
  const options = (field.options || []).map((row) => ({ id: row.id, label: row.label }));
  if (many) {
    const selected = Array.isArray(field.value) ? field.value : [];
    const others = selected.filter((id) => String(id).startsWith('other:'));
    return (
      <OptionPicker
        options={options}
        value={selected.filter((id) => !String(id).startsWith('other:'))}
        onChange={(ids) => onChange([...ids, ...others])}
        multiple
        small={small}
        placeholder="Velg ett eller flere"
        title={field.label}
      />
    );
  }
  return (
    <OptionPicker
      options={options}
      value={String(field.value || '').startsWith('other:') ? '' : (field.value || '')}
      onChange={(id) => onChange(id || '')}
      small={small}
      placeholder="Velg"
      title={field.label}
    />
  );
}

function bracketPlaceholder(field) {
  const raw = String(field?.placeholder || '').trim();
  if (raw) return raw.startsWith('[') ? raw : `[${raw}]`;
  if (field?.kind === 'date') return '[Dato]';
  if (field?.kind === 'time') return '[TT:MM]';
  return '';
}

function stampText(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} kl. ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

/** Digital signatur: navnet til den som er logget inn og tidspunktet. */
function SignAnswer({ field, colors, onChange, signer, need }) {
  const value = field.value && typeof field.value === 'object' ? field.value : null;
  const [typed, setTyped] = React.useState('');
  const known = String(signer?.name || '').trim();
  const name = known || typed.trim();
  return (
    <View style={[styles.signBox, { borderColor: need ? FOCUS_FIELD_BORDER : colors.line, backgroundColor: need ? FOCUS_FIELD_BG : colors.card }]}>
      <Text style={[styles.docLabel, { color: need ? FOCUS_FIELD_INK : colors.ink, fontWeight: '600' }]}>{field.label}{field.required ? ' *' : ''}</Text>
      {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
      {value?.name ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.ink }}>Signert digitalt av {value.name}{value.at ? ` · ${stampText(value.at)}` : ''}</Text>
          <TouchableOpacity onPress={() => onChange(null)} accessibilityRole="button">
            <Text style={{ color: colors.danger, fontSize: 13 }}>Fjern signatur</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          {!known ? (
            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder="Navnet ditt"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
            />
          ) : null}
          <TouchableOpacity
            onPress={() => onChange({ name, uid: signer?.uid || '', at: new Date().toISOString() })}
            disabled={!name}
            accessibilityRole="button"
            style={[styles.signButton, { backgroundColor: name ? colors.brand : colors.sunken }]}
          >
            <Text style={{ color: name ? '#fff' : colors.muted, fontWeight: '600' }}>{name ? `Signer som ${name}` : 'Skriv navnet for å signere'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function Mark({ on, radio, colors }) {
  return (
    <View style={[styles.mark, radio && styles.markRound, { borderColor: colors.ink }]}>
      {on ? <View style={[styles.markFill, radio && styles.markFillRound, { backgroundColor: colors.ink }]} /> : null}
    </View>
  );
}

export default function FormAnswer({ field, colors, onChange, onPickFile, variant = 'stacked', signer = null, highlight = true, caption = true }) {
  const cell = variant === 'cell';
  const doc = variant === 'document' || cell;
  const need = highlight && needsInput(field);
  const needBox = need ? { backgroundColor: FOCUS_FIELD_BG, borderColor: FOCUS_FIELD_BORDER } : null;
  if (field?.kind === 'note') {
    return <Text style={[styles.note, { color: colors.ink }]}>{field.label}</Text>;
  }
  if (field?.kind === 'table') {
    return <FormTableAnswer field={field} colors={colors} onChange={onChange} readOnly={field.editor === 'fast'} highlight={highlight} caption={caption} />;
  }
  if (field?.kind === 'sign' && field.editor !== 'fast') {
    return <SignAnswer field={field} colors={colors} onChange={onChange} signer={signer} need={need} />;
  }
  if (!field || field.kind === 'title') {
    return <Text style={[doc ? styles.docSection : styles.title, { color: colors.ink, borderBottomColor: colors.line }]}>{field?.label}</Text>;
  }
  if (field.editor === 'fast') {
    const raw = field.value;
    const shown = raw == null || raw === '' || raw === false
      ? ''
      : field.kind === 'sign'
        ? (raw?.name ? `Signert digitalt av ${raw.name}` : '')
        : field.kind === 'check'
        ? 'Ja'
        : Array.isArray(raw)
          ? raw.map((id) => (field.options || []).find((row) => row.id === id)?.label || String(id).replace(/^other:/, '')).filter(Boolean).join(', ')
          : (typeof raw === 'object' ? (raw.name || '') : String(raw));
    return (
      <View style={{ gap: 2 }}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{field.label}</Text>
        {shown ? <Text style={{ color: colors.ink }}>{shown}</Text> : null}
      </View>
    );
  }
  const label = `${field.label}${field.required ? ' *' : ''}`;
  if (cell && signatureField(field)) {
    return field.value?.name
      ? <Text style={{ color: colors.ink, fontSize: 12 }}>{field.value.name}</Text>
      : <View style={styles.cellSign} />;
  }
  if (cell && (field.kind === 'choice' || field.kind === 'checks' || field.kind === 'dropdown' || field.kind === 'check')) {
    if (field.kind === 'check') {
      return (
        <TouchableOpacity onPress={() => onChange(!field.value)} accessibilityRole="checkbox" accessibilityState={{ checked: !!field.value }} style={styles.cellOption}>
          <Mark on={!!field.value} colors={colors} />
          <Text style={styles.cellText}>{field.value ? 'Ja' : 'Nei'}</Text>
        </TouchableOpacity>
      );
    }
    if (listPicker(field)) return <ChoicePicker field={field} onChange={onChange} small />;
    const many = field.kind === 'checks';
    const selected = many ? (field.value || []) : field.value;
    return (
      <View style={styles.cellOptions}>
        {(field.options || []).map((option) => {
          const on = many ? selected.includes(option.id) : selected === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              onPress={() => {
                if (!many) onChange(option.id);
                else onChange(on ? selected.filter((id) => id !== option.id) : [...selected, option.id]);
              }}
              accessibilityRole={many ? 'checkbox' : 'radio'}
              accessibilityState={{ checked: on }}
              style={styles.cellOption}
            >
              <Mark on={on} radio={!many && field.kind !== 'dropdown'} colors={colors} />
              <Text style={styles.cellText}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }
  if (cell && field.kind !== 'long' && field.kind !== 'scale' && field.kind !== 'image' && field.kind !== 'file') {
    return (
      <TextInput
        value={String(field.value || '')}
        onChangeText={onChange}
        placeholder={bracketPlaceholder(field)}
        placeholderTextColor={colors.placeholder}
        keyboardType={field.kind === 'number' ? 'decimal-pad' : 'default'}
        style={[styles.cellInput, { color: colors.ink }, needBox]}
      />
    );
  }
  if (cell && field.kind === 'long') {
    return (
      <TextInput
        value={String(field.value || '')}
        onChangeText={onChange}
        placeholder={bracketPlaceholder(field) || 'Skriv her'}
        placeholderTextColor={colors.placeholder}
        multiline
        style={[styles.cellArea, { color: colors.ink }, needBox]}
      />
    );
  }
  if (doc && signatureField(field)) {
    return (
      <View style={[styles.signature, needBox && { ...needBox, borderWidth: 1, padding: 6, borderRadius: 6 }]}>
        <View style={[styles.signLine, { borderBottomColor: colors.ink }]} />
        <Text style={[styles.docLabel, { color: colors.ink }]}>{label}</Text>
        {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
        <TouchableOpacity onPress={() => onPickFile(field)} accessibilityRole="button">
          <Text style={{ color: colors.brand, fontSize: 13 }}>Last opp signatur</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (field.kind === 'check') {
    return (
      <TouchableOpacity onPress={() => onChange(!field.value)} accessibilityRole="checkbox" accessibilityState={{ checked: !!field.value }} style={[doc ? styles.docCheck : undefined, needBox && { ...needBox, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6 }]}>
        <Text style={{ color: colors.ink }}>{field.value ? '☑' : '☐'} {label}</Text>
        {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
      </TouchableOpacity>
    );
  }
  if (field.kind === 'choice' || field.kind === 'dropdown' || field.kind === 'checks') {
    const many = field.kind === 'checks';
    const selected = many ? (field.value || []) : field.value;
    return (
      <View style={[{ gap: doc ? 6 : 4 }, needBox && { ...needBox, borderWidth: 1, borderRadius: 8, padding: 8 }]}>
        <Text style={[doc ? styles.docLabel : null, { color: colors.ink }]}>{label}</Text>
        {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
        <View style={doc ? styles.docOptions : { gap: 4 }}>
        {listPicker(field) ? <ChoicePicker field={field} onChange={onChange} /> : (field.options || []).map((option) => {
          const on = many ? selected.includes(option.id) : selected === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              onPress={() => {
                if (!many) onChange(option.id);
                else onChange(on ? selected.filter((id) => id !== option.id) : [...selected, option.id]);
              }}
              accessibilityRole={many ? 'checkbox' : 'radio'}
              accessibilityState={{ checked: on }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: colors.ink }}>{on ? (many ? '☑' : '◉') : (many ? '☐' : '○')} {option.label}</Text>
                {option.image ? <Image source={{ uri: option.image }} style={styles.optionImage} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
        {field.other ? (
          <TextInput
            value={many
              ? String((selected || []).find((id) => String(id).startsWith('other:')) || '').slice(6)
              : (String(selected || '').startsWith('other:') ? String(selected).slice(6) : '')}
            onChangeText={(next) => {
              if (!many) onChange(next ? `other:${next}` : '');
              else {
                const kept = (selected || []).filter((id) => !String(id).startsWith('other:'));
                onChange(next ? [...kept, `other:${next}`] : kept);
              }
            }}
            placeholder="Annet"
            placeholderTextColor={colors.placeholder}
            style={[doc ? styles.docInput : styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: doc ? 'transparent' : colors.card }]}
          />
        ) : null}
        </View>
      </View>
    );
  }
  if (field.kind === 'scale') {
    const max = field.scaleMax || 5;
    const current = String(field.value || '');
    return (
      <View style={[{ gap: 6 }, needBox && { ...needBox, borderWidth: 1, borderRadius: 8, padding: 8 }]}>
        <Text style={{ color: colors.ink }}>{label}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Array.from({ length: max }, (_, i) => String(i + 1)).map((n) => (
            <TouchableOpacity
              key={n}
              onPress={() => onChange(n)}
              accessibilityRole="radio"
              accessibilityState={{ checked: current === n }}
              style={[styles.scale, { borderColor: current === n ? colors.brand : colors.line, backgroundColor: current === n ? colors.brand : colors.card }]}
            >
              <Text style={{ color: current === n ? '#fff' : colors.ink }}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.muted }}>{field.lowLabel || 'Lav'}</Text>
          <Text style={{ color: colors.muted }}>{field.highLabel || 'Høy'}</Text>
        </View>
      </View>
    );
  }
  if (field.kind === 'image' || field.kind === 'file') {
    const stored = field.value?.name;
    return (
      <View style={[{ gap: 4 }, needBox && { ...needBox, borderWidth: 1, borderRadius: 8, padding: 8 }]}>
        <Text style={{ color: colors.ink }}>{label}</Text>
        {field.help ? <Text style={{ color: colors.muted }}>{field.help}</Text> : null}
        <Text style={{ color: colors.muted }}>{stored || (field.kind === 'image' ? 'Ingen bilde er lagt inn' : 'Ingen fil er lagt inn')}</Text>
        <TouchableOpacity onPress={() => onPickFile(field)} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>{field.kind === 'image' ? 'Last opp bilde' : 'Last opp fil'}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  const placeholder = field.placeholder || (field.kind === 'date' ? 'ÅÅÅÅ-MM-DD' : field.kind === 'time' ? 'TT:MM' : fieldType(field.kind).label);
  if (doc && field.kind !== 'long') {
    const stacked = String(field.label || '').length > 22;
    return (
      <View style={{ gap: 2, flex: 1 }}>
        <View style={stacked ? styles.docStack : styles.docBlank}>
          <Text style={[styles.docLabel, { color: colors.ink }, stacked ? null : styles.docLabelSide]}>{label}</Text>
          <TextInput
            value={String(field.value || '')}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={colors.placeholder}
            keyboardType={field.kind === 'number' ? 'decimal-pad' : 'default'}
            style={[styles.docInput, { color: colors.ink, borderBottomColor: colors.ink }, need && { backgroundColor: FOCUS_FIELD_BG, borderBottomColor: FOCUS_FIELD_BORDER }]}
          />
        </View>
        {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
      </View>
    );
  }
  return (
    <View style={{ gap: 4 }}>
      <Text style={[doc ? styles.docLabel : null, { color: doc ? colors.ink : colors.muted }]}>{label}</Text>
      {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
      <TextInput
        value={String(field.value || '')}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        multiline={field.kind === 'long'}
        keyboardType={field.kind === 'number' ? 'decimal-pad' : 'default'}
        style={[doc ? styles.docArea : styles.input, field.kind === 'long' && !doc && styles.long, { color: colors.ink, borderColor: colors.line, backgroundColor: doc ? 'transparent' : colors.card }, needBox]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '600' },
  note: { fontSize: 13, lineHeight: 19 },
  help: { fontSize: 12, lineHeight: 16 },
  docSection: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', borderBottomWidth: 1, paddingBottom: 4, marginTop: 16, marginBottom: 6 },
  docLabel: { fontSize: 13, lineHeight: 18 },
  docLabelSide: { maxWidth: '46%', flexShrink: 1 },
  docBlank: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingVertical: 4, minHeight: 32 },
  docStack: { gap: 2, paddingVertical: 4 },
  docCheck: { paddingVertical: 4 },
  docOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  docInput: { flex: 1, minWidth: 80, borderBottomWidth: 1, borderRadius: 0, paddingHorizontal: 2, paddingVertical: 2, fontSize: 14, backgroundColor: 'transparent' },
  docArea: { borderWidth: 1, borderRadius: 0, minHeight: 72, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14, textAlignVertical: 'top' },
  signature: { marginTop: 8, maxWidth: 260, gap: 4 },
  signLine: { height: 36, borderBottomWidth: 1 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  long: { minHeight: 80, textAlignVertical: 'top' },
  scale: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  optionImage: { width: 36, height: 36, borderRadius: 6 },
  mark: { width: 11, height: 11, borderWidth: 1, borderRadius: 1, alignItems: 'center', justifyContent: 'center' },
  markRound: { borderRadius: 6 },
  markFill: { width: 6, height: 6 },
  markFillRound: { borderRadius: 3 },
  cellText: { fontSize: 12, lineHeight: 16, ...FACE },
  cellOption: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cellOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cellInput: { fontSize: 12, lineHeight: 16, paddingVertical: 0, paddingHorizontal: 0, minHeight: 18, ...FACE },
  cellArea: { fontSize: 12, lineHeight: 16, minHeight: 48, paddingVertical: 0, paddingHorizontal: 0, textAlignVertical: 'top', ...FACE },
  cellSign: { minHeight: 36, justifyContent: 'flex-end' },
  signBox: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 6, maxWidth: 420 },
  signButton: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
});
