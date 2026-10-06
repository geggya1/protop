import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  showCustom = true,
}) {
  const [extraDepartment, setExtraDepartment] = useState('');
  const [custom, setCustom] = useState({ label: '', value: '', owner: 'person', purpose: 'cv' });
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
        return (
          <View key={section.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>{section.title}</Text>
              <Text style={[styles.badge, { color: colors.brand }]}>{OWNER_LABEL[section.owner]}</Text>
            </View>
            <Text style={[styles.purpose, { color: colors.muted }]}>
              {PURPOSE_LABEL[section.purpose]}
              {section.blurb ? ` · ${section.blurb}` : ''}
            </Text>
            {section.repeatable ? (
              <RepeatBlock
                section={section}
                items={readPath(draft, section.collection) || []}
                colors={colors}
                editable={editable}
                onChange={(items) => updateItems(section.collection, items)}
                onItemPhoto={section.id === 'projects' ? onProjectImage : undefined}
              />
            ) : section.fields.map((field) => (
              <Field
                key={field.key}
                field={field}
                draft={draft}
                colors={colors}
                editable={editable}
                departments={departments}
                members={members}
                addressHits={field.type === 'address' ? addressHits : []}
                onPickAddress={onPickAddress}
                extraDepartment={extraDepartment}
                setExtraDepartment={setExtraDepartment}
                onPhoto={onPhoto}
                onChange={update}
              />
            ))}
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

function Field({
  field, draft, colors, editable, departments, members, addressHits, onPickAddress,
  extraDepartment, setExtraDepartment, onPhoto, onChange,
}) {
  const value = readPath(draft, field.key);
  const label = (
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
              onPress={() => onChange(field.key, value === option.value ? '' : option.value)}
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

  const multiline = field.type === 'textarea';
  return (
    <View style={styles.field}>
      {label}
      <TextInput
        value={String(value || '')}
        onChangeText={(next) => onChange(field.key, next)}
        editable={editable}
        multiline={multiline}
        placeholder={field.placeholder || ''}
        placeholderTextColor={colors.placeholder}
        keyboardType={field.type === 'percent' ? 'number-pad' : field.type === 'email' ? 'email-address' : 'default'}
        autoCapitalize={field.type === 'email' ? 'none' : 'sentences'}
        style={[
          styles.input,
          multiline && styles.area,
          { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg },
        ]}
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

function RepeatBlock({ section, items, colors, editable, onChange, onItemPhoto }) {
  const list = Array.isArray(items) ? items : [];
  function patch(index, key, value) {
    onChange(list.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  }
  return (
    <View style={styles.stackTight}>
      {list.map((item, index) => (
        <View key={item.id || index} style={[styles.repeat, { borderColor: colors.line, backgroundColor: colors.bg }]}>
          <Text style={[styles.label, { color: colors.ink }]}>{section.itemLabel} {index + 1}</Text>
          {section.fields.map((field) => (
            field.type === 'photo' ? (
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
                        onPress={() => onItemPhoto?.(index)}
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
            ) : (
              <View key={field.key} style={styles.field}>
                <Text style={[styles.label, { color: colors.muted }]}>{field.label}</Text>
                <TextInput
                  value={String(item[field.key] || '')}
                  onChangeText={(value) => patch(index, field.key, value)}
                  editable={editable}
                  multiline={field.type === 'textarea'}
                  placeholder={field.placeholder || ''}
                  placeholderTextColor={colors.placeholder}
                  style={[
                    styles.input,
                    field.type === 'textarea' && styles.area,
                    { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card },
                  ]}
                />
              </View>
            )
          ))}
          {editable ? (
            <TouchableOpacity onPress={() => onChange(list.filter((_, rowIndex) => rowIndex !== index))} accessibilityRole="button">
              <Text style={{ color: colors.danger || '#b42318' }}>Fjern</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
      {editable ? (
        <TouchableOpacity
          onPress={() => onChange([...list, blankRepeatItem(section)])}
          accessibilityRole="button"
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  phoneRow: { gap: 8 },
  dials: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  photo: { width: 84, height: 84, borderRadius: 12 },
  projectPhoto: { width: 120, height: 80, borderRadius: 8 },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  secondary: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  inline: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  grow: { flex: 1 },
  hits: { gap: 6 },
  repeat: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
});
