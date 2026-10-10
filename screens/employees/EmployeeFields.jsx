import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { insertBullet, moveItem, sortByStartDesc, sortCoursesDesc, wrapSelection } from '../../src/employees/cvFormat';
import { levelById, placedLevelId } from '../../src/access/companyAccess';
import { blankRepeatItem, readPath, setEmployeePath } from '../../src/employees/model';
import { OWNER_LABEL, PURPOSE_LABEL, sectionsFor } from '../../src/employees/schema';
import { PHONE_COUNTRIES, parsePhoneInput, splitPhone } from '../../src/utils/phone';

function Chip({ label, on, onPress, colors, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on, disabled: !!disabled }}
      style={[
        styles.chip,
        {
          borderColor: on ? colors.brand : colors.line,
          backgroundColor: on ? colors.brandSoft : colors.card,
        },
      ]}
    >
      <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function PhoneField({ value, onChangeText, colors, editable, placeholder }) {
  const [dial, setDial] = useState(() => splitPhone(value).dialCode);
  const [national, setNational] = useState(() => splitPhone(value).national);
  useEffect(() => {
    const next = splitPhone(value);
    setDial(next.dialCode);
    setNational(next.national);
  }, [value]);

  function write(nextDial, nextNational) {
    setDial(nextDial);
    setNational(nextNational);
    onChangeText(nextNational ? parsePhoneInput(nextDial, nextNational) : '');
  }

  return (
    <View style={styles.phoneRow}>
      <View style={styles.dials}>
        {PHONE_COUNTRIES.slice(0, 4).map((country) => (
          <Chip
            key={country.code}
            label={`${country.flag} ${country.dial}`}
            on={dial === country.dial}
            disabled={!editable}
            onPress={() => write(country.dial, national)}
            colors={colors}
          />
        ))}
      </View>
      <TextInput
        value={national}
        onChangeText={(next) => write(dial, next)}
        editable={editable}
        keyboardType="phone-pad"
        placeholder={placeholder || '900 00 000'}
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
    </View>
  );
}

function suggestions(field) {
  return (field.options || []).map((option) => (
    typeof option === 'string' ? { value: option, label: option } : option
  ));
}

const REVIEW_PLURAL = {
  education: ['utdanning', 'utdanninger'],
  certifications: ['sertifisering', 'sertifiseringer'],
  courses: ['kurs', 'kurs'],
  experience: ['erfaring', 'erfaringer'],
  projects: ['prosjekt', 'prosjekter'],
};

function clipText(value, limit = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

function itemLine(section, item) {
  let line = item.title || section.itemLabel || 'Oppføring';
  if (section.id === 'education') line = [item.from, item.to, item.school, item.program].filter(Boolean).join(' · ') || 'Utdanning';
  else if (section.id === 'experience') line = [item.employer, item.title, item.from].filter(Boolean).join(' · ') || 'Erfaring';
  else if (section.id === 'courses') line = [item.date, item.title].filter(Boolean).join(' · ') || 'Kurs';
  else if (section.id === 'projects') line = [item.title, item.client].filter(Boolean).join(' · ') || 'Prosjekt';
  return clipText(line, 90);
}

function sectionLine(section, draft) {
  if (section.repeatable) {
    const items = readPath(draft, section.collection) || [];
    if (!items.length) return 'Ingenting er lagt inn';
    const pair = REVIEW_PLURAL[section.id] || [section.itemLabel.toLowerCase(), `${section.itemLabel.toLowerCase()}er`];
    return `${items.length} ${items.length === 1 ? pair[0] : pair[1]}`;
  }
  const bits = (section.fields || []).map((field) => {
    const value = readPath(draft, field.key);
    if (field.type === 'photo') return value ? 'Bilde er lagt inn' : '';
    if (field.type === 'bool') return value ? field.label : '';
    return clipText(value, 80);
  }).filter(Boolean);
  return clipText(bits.slice(0, 3).join(' · ') || 'Ikke fylt ut');
}

export default function EmployeeFields({
  draft,
  scope,
  colors,
  canEditOwner,
  departments,
  members,
  addressHits,
  onPickAddress,
  onChange,
  onPhoto,
  onProjectImage,
  sections: sectionsProp,
  lockedKeys = [],
  showCustom = true,
  review = false,
  startOpen = '',
  focusItemId = '',
  openToken = 0,
  hideItems = false,
  onClose,
  onAddedItem,
  onSave,
}) {
  const [extraDepartment, setExtraDepartment] = useState('');
  const [custom, setCustom] = useState({ label: '', value: '', owner: 'person', purpose: 'cv' });
  const [openId, setOpenId] = useState(startOpen);
  useEffect(() => {
    if (startOpen) setOpenId(startOpen);
  }, [startOpen, openToken]);
  if (!draft) return null;
  const sections = sectionsProp || sectionsFor(scope);

  function update(path, value) {
    onChange(setEmployeePath(draft, path, value));
  }

  function updateItems(collection, items) {
    onChange(setEmployeePath(draft, collection, items));
  }

  function addCustom() {
    const label = custom.label.trim();
    if (!label) return;
    const owner = canEditOwner('company') && custom.owner === 'company' ? 'company' : 'person';
    if (!canEditOwner(owner)) return;
    const next = [...(draft.customFields || []), {
      id: `fld_${Date.now().toString(36)}`,
      label,
      value: custom.value.trim(),
      owner,
      purpose: custom.purpose,
    }];
    onChange({ ...draft, customFields: next });
    setCustom({ label: '', value: '', owner: 'person', purpose: 'cv' });
  }

  return (
    <View style={styles.stack}>
      {sections.map((section) => {
        const editable = canEditOwner(section.owner);
        const open = !review || openId === section.id;
        return (
          <View key={section.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>{section.title}</Text>
              {review ? (
                <View style={styles.inline}>
                  {open ? (
                    <TouchableOpacity
                      onPress={() => {
                        if (onSave) onSave();
                        else if (onClose) onClose();
                        else setOpenId('');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Lagre ${section.title}`}
                      style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
                    >
                      <Text style={styles.primaryBtnText}>Lagre</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => {
                      if (open && onClose) onClose();
                      else setOpenId(open ? '' : section.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={open ? `Lukk ${section.title}` : `Rediger ${section.title}`}
                    style={[styles.secondary, { borderColor: colors.line }]}
                  >
                    <Text style={{ color: colors.ink }}>{open ? 'Lukk' : '✎ Rediger'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={[styles.badge, { color: colors.brand }]}>{OWNER_LABEL[section.owner]}</Text>
              )}
            </View>
            {review && !open ? (
              <Text style={[styles.purpose, { color: colors.muted }]}>{sectionLine(section, draft)}</Text>
            ) : null}
            {!review ? (
              <Text style={[styles.purpose, { color: colors.muted }]}>
                {PURPOSE_LABEL[section.purpose]}
                {section.blurb ? ` · ${section.blurb}` : ''}
              </Text>
            ) : null}
            {open && section.repeatable ? (
              <RepeatBlock
                section={section}
                items={readPath(draft, section.collection) || []}
                colors={colors}
                editable={editable}
                compact={review}
                focusItemId={focusItemId}
                hideItems={hideItems}
                onChange={(items) => updateItems(section.collection, items)}
                onItemPhoto={section.id === 'projects' ? onProjectImage : undefined}
                onAddedItem={onAddedItem}
                onSave={onSave || onClose}
              />
            ) : null}
            {open && !section.repeatable ? section.fields.map((field) => (
              <EmployeeField
                key={field.key}
                field={field}
                draft={draft}
                colors={colors}
                editable={editable && !lockedKeys.includes(field.key)}
                departments={departments}
                members={members}
                addressHits={field.type === 'address' ? addressHits : []}
                onPickAddress={onPickAddress}
                extraDepartment={extraDepartment}
                setExtraDepartment={setExtraDepartment}
                onPhoto={onPhoto}
                onChange={update}
              />
            )) : null}
          </View>
        );
      })}

      {showCustom ? (
      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Egne felt</Text>
        <Text style={[styles.purpose, { color: colors.muted }]}>
          Flere opplysninger kan legges til her uten å vente på en ny versjon.
        </Text>
        {(draft.customFields || []).map((field) => {
          const editable = canEditOwner(field.owner);
          return (
            <View key={field.id} style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>
                {field.label} · {OWNER_LABEL[field.owner] || 'Felt'}
              </Text>
              <TextInput
                value={field.value}
                editable={editable}
                onChangeText={(value) => onChange({
                  ...draft,
                  customFields: draft.customFields.map((row) => (row.id === field.id ? { ...row, value } : row)),
                })}
                placeholderTextColor={colors.placeholder}
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              />
              {editable ? (
                <TouchableOpacity
                  onPress={() => onChange({
                    ...draft,
                    customFields: draft.customFields.filter((row) => row.id !== field.id),
                  })}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.danger || '#b42318' }}>Fjern felt</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
        <TextInput
          value={custom.label}
          onChangeText={(label) => setCustom((row) => ({ ...row, label }))}
          placeholder="Navn på felt"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        <TextInput
          value={custom.value}
          onChangeText={(value) => setCustom((row) => ({ ...row, value }))}
          placeholder="Verdi"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        <View style={styles.chips}>
          {canEditOwner('person') ? (
            <Chip label="Følger personen" on={custom.owner === 'person'} onPress={() => setCustom((row) => ({ ...row, owner: 'person' }))} colors={colors} />
          ) : null}
          {canEditOwner('company') ? (
            <Chip label="Bare selskapet" on={custom.owner === 'company'} onPress={() => setCustom((row) => ({ ...row, owner: 'company' }))} colors={colors} />
          ) : null}
          <Chip label="Til CV" on={custom.purpose === 'cv'} onPress={() => setCustom((row) => ({ ...row, purpose: 'cv' }))} colors={colors} />
          <Chip label="Drift" on={custom.purpose === 'operations'} onPress={() => setCustom((row) => ({ ...row, purpose: 'operations' }))} colors={colors} />
        </View>
        <TouchableOpacity onPress={addCustom} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
          <Text style={{ color: colors.ink }}>Legg til felt</Text>
        </TouchableOpacity>
      </View>
      ) : null}
    </View>
  );
}

export function EmployeeField({
  field, draft, colors, editable, departments, members, addressHits, onPickAddress,
  extraDepartment, setExtraDepartment, onPhoto, onChange, hideLabel = false,
}) {
  const stored = readPath(draft, field.key);
  const value = field.key === 'company.accessRole'
    ? (levelById(placedLevelId(draft))?.label || stored)
    : stored;
  const label = hideLabel ? null : (
    <Text style={[styles.label, { color: colors.muted }]}>
      {field.label}
      {field.requiredFor === 'register' ? ' *' : ''}
      {field.sensitive ? ' · skjult for andre' : ''}
    </Text>
  );

  if (field.type === 'photo') {
    return (
      <View style={styles.field}>
        {label}
        <View style={styles.photoRow}>
          {value ? (
            <Image source={{ uri: value }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoEmpty, { backgroundColor: colors.sunken }]}>
              <Text style={{ color: colors.muted }}>Bilde</Text>
            </View>
          )}
          {editable ? (
            <View style={styles.stackTight}>
              <TouchableOpacity onPress={onPhoto} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink }}>{value ? 'Bytt bilde' : 'Velg bilde'}</Text>
              </TouchableOpacity>
              {value ? (
                <TouchableOpacity onPress={() => onChange(field.key, '')} accessibilityRole="button">
                  <Text style={{ color: colors.danger || '#b42318' }}>Fjern bilde</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  if (field.type === 'bool') {
    return (
      <Chip
        label={field.label}
        on={value === true}
        disabled={!editable}
        onPress={() => onChange(field.key, !value)}
        colors={colors}
      />
    );
  }

  if (field.type === 'choice' || field.type === 'suggest') {
    const options = suggestions(field);
    return (
      <View style={styles.field}>
        {label}
        <View style={styles.chips}>
          {options.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              on={value === option.value}
              disabled={!editable}
              onPress={() => onChange(
                field.key,
                field.key === 'company.accessRole' || value !== option.value ? option.value : '',
              )}
              colors={colors}
            />
          ))}
        </View>
        {field.type === 'suggest' ? (
          <TextInput
            value={String(value || '')}
            onChangeText={(next) => onChange(field.key, next)}
            editable={editable}
            placeholder={field.placeholder || 'Eller skriv selv'}
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
        ) : null}
      </View>
    );
  }

  if (field.type === 'departments') {
    const extras = draft.company?.extraDepartments || [];
    function addExtra() {
      const name = extraDepartment.trim();
      if (!name || extras.some((row) => row.toLowerCase() === name.toLowerCase())) return;
      onChange('company.extraDepartments', [...extras, name]);
      setExtraDepartment('');
    }
    return (
      <View style={styles.field}>
        {label}
        <View style={styles.chips}>
          {(departments || []).map((unit) => {
            const on = (draft.company?.departmentIds || []).includes(unit.id);
            return (
              <Chip
                key={unit.id}
                label={unit.name}
                on={on}
                disabled={!editable}
                colors={colors}
                onPress={() => {
                  const ids = new Set(draft.company?.departmentIds || []);
                  if (ids.has(unit.id)) ids.delete(unit.id);
                  else ids.add(unit.id);
                  onChange('company.departmentIds', [...ids]);
                }}
              />
            );
          })}
          {extras.map((name) => (
            <Chip
              key={name}
              label={name}
              on
              disabled={!editable}
              colors={colors}
              onPress={() => onChange('company.extraDepartments', extras.filter((row) => row !== name))}
            />
          ))}
        </View>
        {editable ? (
          <View style={styles.inline}>
            <TextInput
              value={extraDepartment}
              onChangeText={setExtraDepartment}
              placeholder="Ny avdeling"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, styles.grow, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            <TouchableOpacity onPress={addExtra} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Legg til</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {!departments?.length ? (
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Avdelinger registrert under Selskap vises her. Du kan også skrive navnet direkte.
          </Text>
        ) : null}
      </View>
    );
  }

  if (field.type === 'member') {
    return (
      <View style={styles.field}>
        {label}
        <View style={styles.chips}>
          <Chip
            label="Ikke knyttet"
            on={!draft.personUid}
            disabled={!editable}
            colors={colors}
            onPress={() => onChange('personUid', '')}
          />
          {(members || []).map((member) => (
            <Chip
              key={member.uid || member.id}
              label={member.name || 'Medlem'}
              on={draft.personUid === (member.uid || member.id)}
              disabled={!editable}
              colors={colors}
              onPress={() => onChange('personUid', member.uid || member.id)}
            />
          ))}
        </View>
      </View>
    );
  }

  if (field.type === 'phone') {
    return (
      <View style={styles.field}>
        {label}
        <PhoneField
          value={String(value || '')}
          editable={editable}
          colors={colors}
          onChangeText={(next) => onChange(field.key, next)}
        />
      </View>
    );
  }

  if (field.type === 'tags') {
    return (
      <TagsField
        label={label}
        value={value}
        editable={editable}
        colors={colors}
        onChange={(next) => onChange(field.key, next)}
      />
    );
  }

  if (field.type === 'textarea') {
    return (
      <View style={styles.field}>
        {label}
        <RichTextField
          value={String(value || '')}
          onChangeText={(next) => onChange(field.key, next)}
          editable={editable}
          placeholder={field.placeholder || ''}
          colors={colors}
        />
      </View>
    );
  }

  return (
    <View style={styles.field}>
      {label}
      <TextInput
        value={String(value || '')}
        onChangeText={(next) => onChange(field.key, next)}
        editable={editable}
        placeholder={field.placeholder || ''}
        placeholderTextColor={colors.placeholder}
        keyboardType={field.type === 'percent' ? 'number-pad' : field.type === 'email' ? 'email-address' : 'default'}
        autoCapitalize={field.type === 'email' ? 'none' : 'sentences'}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
      />
      {field.type === 'address' && addressHits?.length ? (
        <View style={styles.hits}>
          {addressHits.map((hit) => (
            <TouchableOpacity key={hit.id || hit.label} onPress={() => onPickAddress(hit)} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>{hit.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function FormatChip({ label, onPress, colors, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.formatChip, { borderColor: colors.line, opacity: disabled ? 0.45 : 1 }]}
    >
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function RichTextField({ value, onChangeText, editable, placeholder, colors }) {
  const [expanded, setExpanded] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const inputRef = useRef(null);

  function applyWrap(prefix, suffix) {
    if (!editable) return;
    const next = wrapSelection(value, selection.start, selection.end, prefix, suffix);
    onChangeText(next.text);
    const sel = { start: next.start, end: next.end };
    setSelection(sel);
    if (Platform.OS === 'web') {
      setTimeout(() => inputRef.current?.setNativeProps?.({ selection: sel }), 0);
    }
  }

  function applyBullet() {
    if (!editable) return;
    const next = insertBullet(value, selection.start);
    onChangeText(next.text);
    const sel = { start: next.caret, end: next.caret };
    setSelection(sel);
  }

  return (
    <View style={styles.richWrap}>
      {editable ? (
        <View style={styles.formatRow}>
          <FormatChip label="Fet" onPress={() => applyWrap('**')} colors={colors} />
          <FormatChip label="Kursiv" onPress={() => applyWrap('_')} colors={colors} />
          <FormatChip label="Understrek" onPress={() => applyWrap('__')} colors={colors} />
          <FormatChip label="• Liste" onPress={applyBullet} colors={colors} />
          <FormatChip
            label={expanded ? 'Mindre' : 'Utvid'}
            onPress={() => setExpanded((on) => !on)}
            colors={colors}
          />
        </View>
      ) : null}
      <TextInput
        ref={inputRef}
        value={String(value || '')}
        onChangeText={onChangeText}
        editable={editable}
        multiline
        placeholder={placeholder || ''}
        placeholderTextColor={colors.placeholder}
        onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
        style={[
          styles.input,
          styles.area,
          expanded && styles.areaExpanded,
          { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg },
        ]}
      />
    </View>
  );
}

function TagsField({ label, value, editable, colors, onChange }) {
  const list = Array.isArray(value) ? value : [];
  const [draft, setDraft] = useState('');
  function add() {
    const next = draft.trim();
    if (!next) return;
    if (!list.some((item) => item.toLowerCase() === next.toLowerCase())) onChange([...list, next]);
    setDraft('');
  }
  return (
    <View style={styles.field}>
      {label}
      <View style={styles.chips}>
        {list.map((item) => (
          <Chip
            key={item}
            label={item}
            on
            disabled={!editable}
            colors={colors}
            onPress={() => onChange(list.filter((row) => row !== item))}
          />
        ))}
      </View>
      {editable ? (
        <View style={styles.inline}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
            placeholder="Ny rettighet"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, styles.grow, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <TouchableOpacity onPress={add} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
            <Text style={{ color: colors.ink }}>Legg til</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        Rettighetene gjelder ansettelsen. De gir ikke administrator i ProTop.
      </Text>
    </View>
  );
}

function sortedRepeatList(section, items) {
  const list = Array.isArray(items) ? items : [];
  if (section.id === 'education' || section.id === 'experience') return sortByStartDesc(list, (row) => row?.from);
  if (section.id === 'courses') return sortCoursesDesc(list);
  return list;
}

function RepeatBlock({
  section, items, colors, editable, onChange, onItemPhoto,
  compact = false, focusItemId = '', hideItems = false, onAddedItem, onSave,
}) {
  const list = Array.isArray(items) ? items : [];
  const [openIndex, setOpenIndex] = useState(-1);
  const [manualOrder, setManualOrder] = useState(false);
  const display = (!manualOrder && !focusItemId && (section.id === 'education' || section.id === 'experience' || section.id === 'courses'))
    ? sortedRepeatList(section, list)
    : list;

  useEffect(() => {
    if (!focusItemId) return;
    const index = list.findIndex((row) => row.id === focusItemId);
    if (index >= 0) setOpenIndex(index);
  // Bare når fokususet bytter oppføring.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusItemId]);

  function patch(index, key, value) {
    const target = display[index];
    if (!target) return;
    onChange(list.map((row) => (row.id === target.id ? { ...row, [key]: value } : row)));
  }

  function indexInSource(item) {
    return list.findIndex((row) => row.id === item.id);
  }

  function addItem() {
    const item = blankRepeatItem(section);
    const next = [...list, item];
    onChange(next);
    setOpenIndex(next.length - 1);
    setManualOrder(true);
    onAddedItem?.(item.id, section.id);
  }

  function move(index, delta) {
    const item = display[index];
    if (!item) return;
    const sourceIndex = indexInSource(item);
    if (sourceIndex < 0) return;
    setManualOrder(true);
    const reordered = moveItem(manualOrder ? list : display, manualOrder ? sourceIndex : index, delta);
    onChange(reordered);
  }

  return (
    <View style={styles.stackTight}>
      {hideItems ? null : display.map((item, index) => {
        const focused = !!focusItemId && item.id === focusItemId;
        if (focusItemId && !focused) return null;
        const showFields = focused || !compact || openIndex === index || openIndex === indexInSource(item);
        return (
        <View key={item.id || index} style={[styles.repeat, { borderColor: colors.line, backgroundColor: colors.bg }]}>
          <View style={styles.cardHead}>
            <Text style={[styles.label, { color: colors.ink, flex: 1 }]}>{compact ? itemLine(section, item) : `${section.itemLabel} ${index + 1}`}</Text>
            <View style={styles.inline}>
              {editable && !focusItemId ? (
                <>
                  <TouchableOpacity
                    onPress={() => move(index, -1)}
                    accessibilityRole="button"
                    accessibilityLabel={`Flytt ${section.itemLabel} opp`}
                    style={[styles.iconBtn, { borderColor: colors.line }]}
                  >
                    <Text style={{ color: colors.ink }}>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => move(index, 1)}
                    accessibilityRole="button"
                    accessibilityLabel={`Flytt ${section.itemLabel} ned`}
                    style={[styles.iconBtn, { borderColor: colors.line }]}
                  >
                    <Text style={{ color: colors.ink }}>↓</Text>
                  </TouchableOpacity>
                </>
              ) : null}
              {compact && !focused ? (
                <TouchableOpacity
                  onPress={() => setOpenIndex(showFields ? -1 : index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Rediger ${section.itemLabel} ${index + 1}`}
                >
                  <Text style={{ color: colors.ink }}>{showFields ? 'Lukk' : '✎'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          {showFields ? section.fields.map((field) => (
            field.type === 'photos' ? (
              <View key={field.key} style={styles.field}>
                <Text style={[styles.label, { color: colors.muted }]}>{field.label}</Text>
                <View style={styles.photoGrid}>
                  {(Array.isArray(item[field.key]) ? item[field.key] : []).map((url, imageIndex) => (
                    <View key={`${imageIndex}-${String(url).slice(0, 24)}`} style={styles.stackTight}>
                      <Image source={{ uri: url }} style={styles.projectPhoto} resizeMode="cover" />
                      {editable ? (
                        <TouchableOpacity
                          onPress={() => patch(index, field.key, item[field.key].filter((_, rowIndex) => rowIndex !== imageIndex))}
                          accessibilityRole="button"
                        >
                          <Text style={{ color: colors.danger || '#b42318' }}>Fjern</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>
                {editable ? (
                  <TouchableOpacity
                    onPress={() => onItemPhoto?.(indexInSource(item))}
                    accessibilityRole="button"
                    style={[styles.secondary, { borderColor: colors.line }]}
                  >
                    <Text style={{ color: colors.ink }}>Legg til bilder</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : field.type === 'photo' ? (
              <View key={field.key} style={styles.field}>
                <Text style={[styles.label, { color: colors.muted }]}>{field.label}</Text>
                <View style={styles.photoRow}>
                  {item[field.key] ? (
                    <Image source={{ uri: item[field.key] }} style={styles.projectPhoto} resizeMode="cover" />
                  ) : (
                    <View style={[styles.projectPhoto, styles.photoEmpty, { backgroundColor: colors.sunken }]}>
                      <Text style={{ color: colors.muted }}>Bilde</Text>
                    </View>
                  )}
                  {editable ? (
                    <View style={styles.stackTight}>
                      <TouchableOpacity
                        onPress={() => onItemPhoto?.(indexInSource(item))}
                        accessibilityRole="button"
                        style={[styles.secondary, { borderColor: colors.line }]}
                      >
                        <Text style={{ color: colors.ink }}>{item[field.key] ? 'Bytt bilde' : 'Velg bilde'}</Text>
                      </TouchableOpacity>
                      {item[field.key] ? (
                        <TouchableOpacity onPress={() => patch(index, field.key, '')} accessibilityRole="button">
                          <Text style={{ color: colors.danger || '#b42318' }}>Fjern bilde</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            ) : field.type === 'bool' ? (
              <Chip
                key={field.key}
                label={field.label}
                on={item[field.key] === true}
                disabled={!editable}
                colors={colors}
                onPress={() => patch(index, field.key, !item[field.key])}
              />
            ) : field.type === 'textarea' ? (
              <View key={field.key} style={styles.field}>
                <Text style={[styles.label, { color: colors.muted }]}>{field.label}</Text>
                <RichTextField
                  value={String(item[field.key] || '')}
                  onChangeText={(value) => patch(index, field.key, value)}
                  editable={editable}
                  placeholder={field.placeholder || ''}
                  colors={colors}
                />
              </View>
            ) : (
              <View key={field.key} style={styles.field}>
                <Text style={[styles.label, { color: colors.muted }]}>{field.label}</Text>
                <TextInput
                  value={String(item[field.key] || '')}
                  onChangeText={(value) => patch(index, field.key, value)}
                  editable={editable}
                  placeholder={field.placeholder || ''}
                  placeholderTextColor={colors.placeholder}
                  style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
                />
              </View>
            )
          )) : null}
          {showFields && editable ? (
            <View style={styles.inline}>
              <TouchableOpacity
                onPress={() => {
                  setOpenIndex(-1);
                  if (focusItemId && onSave) onSave();
                }}
                accessibilityRole="button"
                accessibilityLabel={`Lagre ${section.itemLabel}`}
                style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
              >
                <Text style={styles.primaryBtnText}>Lagre</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onChange(list.filter((row) => row.id !== item.id))}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.danger || '#b42318' }}>Fjern</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        );
      })}
      {editable ? (
        <TouchableOpacity
          onPress={addItem}
          accessibilityRole="button"
          accessibilityLabel={`Legg til ${section.itemLabel.toLowerCase()}`}
          style={[styles.secondary, { borderColor: colors.line }]}
        >
          <Text style={{ color: colors.ink }}>Legg til {section.itemLabel.toLowerCase()}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  stackTight: { gap: 8 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  badge: { fontSize: 12, fontWeight: '600' },
  purpose: { fontSize: 13, lineHeight: 18 },
  field: { gap: 6 },
  label: { fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  area: { minHeight: 96, textAlignVertical: 'top' },
  areaExpanded: { minHeight: 280 },
  richWrap: { gap: 8 },
  formatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  formatChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  phoneRow: { gap: 8 },
  dials: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  photo: { width: 84, height: 84, borderRadius: 12 },
  projectPhoto: { width: 120, height: 80, borderRadius: 8 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  secondary: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  primaryBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  primaryBtnText: { color: '#fff', fontWeight: '600' },
  iconBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  inline: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  grow: { flex: 1 },
  hits: { gap: 6 },
  repeat: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
});
