import React, { useEffect, useMemo, useState } from 'react';
import {
  Image, Linking, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { levelById, placedLevelId } from '../../src/access/companyAccess';
import {
  cardSubtitle,
  choiceLabel,
  contactLine,
  departmentLabels,
  displayName,
  formatNbDate,
  initials,
  setEmployeePath,
  isDeletedEmployee,
  maskNationalId,
  periodLabel,
  personnelKind,
  personnelKindLabel,
  readPath,
  statusLabel,
} from '../../src/employees/model';
import {
  FORM_SECTIONS, OWNER_LABEL, PERSONNEL_KIND_OPTIONS, STATUS_OPTIONS,
} from '../../src/employees/schema';
import EmployeeFields, { EmployeeField } from './EmployeeFields';
import { useLayout } from '../../src/theme';

const DETAIL_TABS = [
  { id: 'home', label: 'Hovedside' },
  { id: 'cv', label: 'CV' },
];

const MAIN_FACT_KEYS = [
  'company.title',
  'company.projectRole',
  'company.accessRole',
  'person.email',
  'company.email',
  'person.username',
  'person.phone',
  'company.externalEmployeeNumber',
  'company.comment',
];

function clip(value, limit = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

function showValue(employee, field, reveal) {
  if (field.sensitive && !reveal) return '';
  if (field.type === 'photo' || field.type === 'departments' || field.type === 'member') return '';
  const raw = readPath(employee, field.key);
  if (field.type === 'tags') return Array.isArray(raw) ? raw.filter(Boolean).join(', ') : '';
  if (field.type === 'bool') return raw ? 'Ja' : '';
  if (field.key === 'person.nationalId') return reveal ? raw : maskNationalId(raw);
  if (field.type === 'date') return formatNbDate(raw);
  if (field.key === 'company.accessRole') {
    const id = placedLevelId(employee);
    if (id) return levelById(id)?.label || clip(raw);
  }
  if (field.type === 'choice') return choiceLabel(field.options, raw);
  if (field.type === 'percent') return raw ? `${raw} %` : '';
  return clip(raw);
}

function fieldMap() {
  const map = new Map();
  for (const section of FORM_SECTIONS) {
    if (section.repeatable) continue;
    for (const field of section.fields) map.set(field.key, field);
  }
  return map;
}

const FIELDS = fieldMap();

function addressLine(person = {}) {
  return [
    person.address1,
    person.address2,
    person.address3,
    [person.postalCode, person.place].filter(Boolean).join(' '),
  ].map((part) => String(part || '').trim()).filter(Boolean).join(', ');
}

function kinLine(person = {}, reveal) {
  if (!reveal) return '';
  return [person.kinName, person.kinPhone, person.kinEmail]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' · ');
}

function projectActive(project) {
  const period = String(project?.period || '').toLowerCase();
  if (!period) return true;
  if (/nåværende|naavaerende|current|pågår|pagar|ongoing/.test(period)) return true;
  if (/–\s*$|-\s*$/.test(period)) return true;
  return !/\b(20\d{2})\b/.test(period) || /nå|nu|current/.test(period);
}

function roleLabels(project, fallbackRole) {
  const raw = String(project?.roles || '')
    .split(/[\n;,|/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (raw.length) return raw;
  if (fallbackRole) return [fallbackRole];
  return ['Prosjekt'];
}

function groupProjects(projects, fallbackRole, onlyActive) {
  const groups = new Map();
  for (const project of projects || []) {
    if (onlyActive && !projectActive(project)) continue;
    for (const role of roleLabels(project, fallbackRole)) {
      if (!groups.has(role)) groups.set(role, []);
      groups.get(role).push(project);
    }
  }
  return [...groups.entries()].map(([role, items]) => ({ role, items }));
}

function projectLine(project) {
  const idPart = project.object || project.client || '';
  const title = project.title || 'Prosjekt';
  const period = project.period ? ` · ${project.period}` : '';
  if (idPart && idPart !== title) return `${title} — ${idPart}${period}`;
  return `${title}${period}`;
}

function repeatSummary(sectionId, item) {
  if (sectionId === 'education') {
    const when = [item.from, item.to].filter(Boolean).join('–');
    return [when, item.school, item.program].filter(Boolean).join(' · ') || 'Utdanning';
  }
  if (sectionId === 'experience') {
    return [item.employer, item.title, item.from].filter(Boolean).join(' · ') || 'Erfaring';
  }
  if (sectionId === 'courses') {
    return [item.date, item.title].filter(Boolean).join(' · ') || 'Kurs';
  }
  if (sectionId === 'projects') {
    return [item.title, item.client].filter(Boolean).join(' · ') || 'Prosjekt';
  }
  return item.title || 'Oppføring';
}

function openLink(url) {
  if (!url) return;
  Linking.openURL(url).catch(() => {});
}

function Pencil({ onPress, colors, label }) {
  if (!onPress) return null;
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label || 'Rediger'}
      hitSlop={8}
      style={styles.pencil}
    >
      <Ionicons name="create-outline" size={16} color={colors.brand} />
    </TouchableOpacity>
  );
}

function FlagChip({ label, on, onPress, colors, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on, disabled: disabled || !onPress }}
      style={[
        styles.flagChip,
        {
          borderColor: on ? colors.brand : colors.line,
          backgroundColor: on ? colors.brandSoft : colors.sunken,
          opacity: disabled ? 0.65 : 1,
        },
      ]}
    >
      <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function FactRow({
  label, value, colors, last, link, onEdit, editing, editor, emptyLabel = 'Ikke satt',
}) {
  const shown = value || ((onEdit || editing) ? emptyLabel : '');
  if (!shown && !editing) return null;
  const valueColor = link && value ? colors.brand : (value ? colors.ink : colors.muted);
  const body = (
    <View style={[styles.factRow, !last && { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text>
      <View style={styles.factValueCol}>
        {editing ? editor : (
          <View style={styles.factValueRow}>
            {link && value ? (
              <Pressable onPress={() => openLink(link)} accessibilityRole="link" accessibilityLabel={label} style={styles.factValueGrow}>
                <Text style={[styles.factValue, { color: valueColor }]}>{shown}</Text>
              </Pressable>
            ) : (
              <Text style={[styles.factValue, styles.factValueGrow, { color: valueColor }]}>{shown}</Text>
            )}
            <Pencil onPress={onEdit} colors={colors} label={`Rediger ${label}`} />
          </View>
        )}
      </View>
    </View>
  );
  return body;
}

function SectionCard({
  title, icon, colors, open, onToggle, children, badge, right, onEdit,
}) {
  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={styles.sectionHead}>
        <TouchableOpacity
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={styles.sectionHeadLeft}
        >
          <View style={[styles.sectionIcon, { backgroundColor: colors.brandSoft }]}>
            <Ionicons name={icon} size={16} color={colors.brand} />
          </View>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>
          {badge ? (
            <Text style={[styles.badge, { color: colors.brand, backgroundColor: colors.brandSoft }]}>{badge}</Text>
          ) : null}
        </TouchableOpacity>
        <View style={styles.sectionHeadRight}>
          <Pencil onPress={onEdit} colors={colors} label={`Rediger ${title}`} />
          {right}
          <TouchableOpacity onPress={onToggle} accessibilityRole="button" accessibilityLabel={open ? 'Skjul' : 'Vis'}>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
          </TouchableOpacity>
        </View>
      </View>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

function GapList({ title, items, colors, onEdit }) {
  return (
    <View style={styles.gapBlock}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{title}</Text>
      {items.map((item) => (
        <View key={item.key} style={styles.factValueRow}>
          <Text style={{ color: colors.ink, fontSize: 14, flex: 1 }}>{`• ${item.label}`}</Text>
          <Pencil onPress={onEdit ? () => onEdit(item) : undefined} colors={colors} label={`Rediger ${item.label}`} />
        </View>
      ))}
    </View>
  );
}

function ownerForKey(key) {
  for (const section of FORM_SECTIONS) {
    if ((section.fields || []).some((field) => field.key === key)) return section.owner;
  }
  return 'company';
}

function InlineEditor({
  fieldKey, employee, colors, canEditOwner, lockedKeys = [], departments, members, addressHits,
  extraDepartment, setExtraDepartment, onPickAddress, onPhoto, onChange, onSave, onCancel, busy,
}) {
  const field = FIELDS.get(fieldKey);
  if (!field) return null;
  const owner = ownerForKey(fieldKey);
  return (
    <View nativeID={`employee-inline-${fieldKey}`} style={styles.inlineEditor}>
      <EmployeeField
        field={field}
        draft={employee}
        colors={colors}
        editable={canEditOwner(owner) && !lockedKeys.includes(field.key)}
        departments={departments}
        members={members}
        addressHits={addressHits}
        extraDepartment={extraDepartment}
        setExtraDepartment={setExtraDepartment}
        onPickAddress={onPickAddress}
        onPhoto={onPhoto}
        onChange={onChange}
        hideLabel
      />
      <View style={styles.inlineActions}>
        <TouchableOpacity
          onPress={onSave}
          disabled={busy}
          accessibilityRole="button"
          style={[styles.saveBtn, { backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]}
        >
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{busy ? 'Lagrer…' : 'Lagre'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} accessibilityRole="button">
          <Text style={{ color: colors.ink, fontSize: 13 }}>Avbryt</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function EmployeeDetailView({
  employee,
  colors,
  companyName,
  departments = [],
  members = [],
  addressHits = [],
  reveal = false,
  gaps = null,
  canEdit = false,
  canEditAccess = false,
  isAdmin = false,
  isSelf = false,
  siblings = [],
  confirmDelete = false,
  busy = false,
  onBack,
  onCv,
  onOpenProject,
  onSelect,
  onChange,
  onSave,
  onClassify,
  onPhoto,
  onPickAddress,
  onPushProfile,
  onPullToProfile,
  onConfirmDelete,
  onCancelDelete,
  onDestroy,
  onRestore,
}) {
  const { isPhone } = useLayout();
  const [editingKey, setEditingKey] = useState('');
  const [editingSection, setEditingSection] = useState('');
  const [extraDepartment, setExtraDepartment] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);
  const [openSections, setOpenSections] = useState({
    personal: true,
    employment: true,
    work: true,
    cvBits: false,
    custom: true,
    gaps: true,
    projects: true,
  });

  useEffect(() => {
    setOnlyActive(true);
    setEditingKey('');
    setEditingSection('');
    setOpenSections({
      personal: true,
      employment: true,
      work: true,
      cvBits: false,
      custom: true,
      gaps: true,
      projects: true,
    });
  }, [employee?.id]);

  const index = siblings.findIndex((row) => row.id === employee.id);
  const prev = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;

  const name = displayName(employee);
  const status = statusLabel(employee.company?.status);
  const depts = departmentLabels(employee, departments);
  const tags = [
    ...depts,
    ...(Array.isArray(employee.company?.permissions) ? employee.company.permissions.filter(Boolean) : []),
  ];

  const mainFacts = useMemo(() => {
    const rows = [];
    const seenEmail = new Set();
    for (const key of MAIN_FACT_KEYS) {
      const field = FIELDS.get(key);
      if (!field) continue;
      const value = showValue(employee, field, reveal);
      if (!value && !canEdit) continue;
      if (value && (key === 'person.email' || key === 'company.email')) {
        const normalized = value.toLowerCase();
        if (seenEmail.has(normalized)) continue;
        seenEmail.add(normalized);
      }
      let link = '';
      if (value && field.type === 'email') link = `mailto:${value}`;
      if (value && field.type === 'phone') link = `tel:${String(value).replace(/\s+/g, '')}`;
      rows.push({
        key,
        label: key === 'company.email' ? 'E-post arbeid' : field.label,
        value,
        link,
      });
    }
    const kin = kinLine(employee.person, reveal);
    if (kin || canEdit) rows.push({ key: 'person.kinName', label: 'Pårørende', value: kin });
    return rows;
  }, [employee, reveal, canEdit]);

  const personalRows = useMemo(() => {
    const person = employee.person || {};
    const rows = [
      { key: 'person.birthDate', label: 'Fødselsdato', value: formatNbDate(person.birthDate) },
      { key: 'person.gender', label: 'Kjønn', value: person.gender },
      { key: 'person.language', label: 'Språk', value: person.language },
      { key: 'person.nationality', label: 'Nasjonalitet', value: person.nationality },
      {
        key: 'person.nationalId',
        label: 'Personnummer',
        value: reveal ? person.nationalId : maskNationalId(person.nationalId),
      },
      { key: 'person.address1', label: 'Adresse', value: addressLine(person) },
      { key: 'person.maritalStatus', label: 'Sivil status', value: person.maritalStatus },
    ];
    return canEdit ? rows : rows.filter((row) => row.value);
  }, [employee, reveal, canEdit]);

  const employmentRows = useMemo(() => {
    const rows = [
      { key: 'company.personnelKind', label: 'Personell', value: personnelKindLabel(personnelKind(employee), companyName) },
      { key: 'company.status', label: 'Status', value: status },
      { key: 'company.employmentType', label: 'Type ansatt', value: employee.company?.employmentType },
      { key: 'company.compensationType', label: 'Type lønnskompensasjon', value: employee.company?.compensationType },
      { key: 'company.canLogin', label: 'Kan logge inn', value: employee.company?.canLogin ? 'Ja' : (canEdit ? 'Nei' : '') },
    ];
    return canEdit ? rows : rows.filter((row) => row.value);
  }, [employee, status, canEdit, companyName]);

  const workRows = useMemo(() => {
    const rows = [
      {
        key: 'company.workPercent',
        label: 'Arbeidsprosent',
        value: employee.company?.workPercent ? `${employee.company.workPercent} %` : '',
      },
      { key: 'company.periodFrom', label: 'Periode', value: periodLabel(employee) },
    ];
    return canEdit ? rows : rows.filter((row) => row.value);
  }, [employee, canEdit]);

  const projectGroups = useMemo(
    () => groupProjects(employee.cv?.projects || [], employee.company?.projectRole, onlyActive),
    [employee, onlyActive],
  );

  const cvSections = useMemo(
    () => FORM_SECTIONS.filter((section) => section.repeatable && section.id !== 'projects')
      .map((section) => {
        const items = readPath(employee, section.collection) || [];
        return { section, items };
      })
      .filter((row) => row.items.length),
    [employee],
  );

  const customFields = (employee.customFields || []).filter((field) => (
    field.value && (isAdmin || (field.owner === 'person' && isSelf))
  ));

  function toggle(id) {
    setOpenSections((current) => ({ ...current, [id]: !current[id] }));
  }

  function onTab(id) {
    if (id === 'home') return;
    if (id === 'cv') onCv?.();
  }

  function canEditOwner(owner) {
    if (owner === 'company') return !!isAdmin;
    return !!isAdmin || !!isSelf;
  }

  function startField(key) {
    if (!canEdit) return;
    setEditingSection('');
    setEditingKey(key);
    setOpenSections((current) => {
      if (key.startsWith('person.')) return { ...current, personal: true };
      if (key.startsWith('company.')) return { ...current, employment: true, work: true };
      return current;
    });
  }

  function startSection(id) {
    if (!canEdit) return;
    setEditingKey('');
    setEditingSection(id);
    setOpenSections((current) => ({ ...current, [id]: true, employment: id === 'employment' ? true : current.employment }));
  }

  function cancelEdit() {
    setEditingKey('');
    setEditingSection('');
  }

  async function saveEdit() {
    const ok = await onSave?.();
    if (ok !== false) cancelEdit();
  }

  function fieldEditor(fieldKey) {
    return (
      <InlineEditor
        fieldKey={fieldKey}
        employee={employee}
        colors={colors}
        canEditOwner={canEditOwner}
        lockedKeys={canEditAccess ? [] : ['company.accessRole']}
        departments={departments}
        members={members}
        addressHits={addressHits}
        extraDepartment={extraDepartment}
        setExtraDepartment={setExtraDepartment}
        onPickAddress={onPickAddress}
        onPhoto={onPhoto}
        onChange={(path, value) => onChange?.(setEmployeePath(employee, path, value))}
        onSave={saveEdit}
        onCancel={cancelEdit}
        busy={busy}
      />
    );
  }

  function sectionEditor(sectionId) {
    const sections = FORM_SECTIONS.filter((section) => section.id === sectionId);
    if (!sections.length) return null;
    return (
      <View nativeID={`employee-inline-section-${sectionId}`} style={styles.inlineEditor}>
        <EmployeeFields
          draft={employee}
          scope="employee"
          sections={sections}
          showCustom={false}
          colors={colors}
          canEditOwner={canEditOwner}
          departments={departments}
          members={members}
          addressHits={addressHits}
          onPickAddress={onPickAddress}
          onChange={onChange}
          onPhoto={onPhoto}
        />
        <View style={styles.inlineActions}>
          <TouchableOpacity
            onPress={saveEdit}
            disabled={busy}
            accessibilityRole="button"
            style={[styles.saveBtn, { backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{busy ? 'Lagrer…' : 'Lagre'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={cancelEdit} accessibilityRole="button">
            <Text style={{ color: colors.ink, fontSize: 13 }}>Avbryt</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View nativeID="employee-detail" style={styles.root}>
      <View style={styles.crumbRow}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" style={styles.crumbBtn}>
          <Text style={{ color: colors.brand, fontSize: 13 }}>Ansatte</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.muted, fontSize: 13 }}> / </Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Oversikt</Text>
      </View>

      <View style={[styles.titleRow, isPhone && styles.titleRowPhone]}>
        <View style={styles.titleBlock}>
          <Text accessibilityRole="header" style={[styles.name, { color: colors.ink }]}>{name}</Text>
          <Text style={{ color: colors.muted, fontSize: 14 }}>
            {[status, cardSubtitle(employee, companyName)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={styles.navActions}>
          <TouchableOpacity
            onPress={() => prev && onSelect?.(prev)}
            disabled={!prev}
            accessibilityRole="button"
            accessibilityLabel="Forrige medarbeider"
            style={[
              styles.navBtn,
              { borderColor: colors.line, backgroundColor: colors.card, opacity: prev ? 1 : 0.45 },
            ]}
          >
            <Ionicons name="chevron-back" size={16} color={colors.ink} />
            <Text style={{ color: colors.ink, fontSize: 13 }}>Forrige</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => next && onSelect?.(next)}
            disabled={!next}
            accessibilityRole="button"
            accessibilityLabel="Neste medarbeider"
            style={[
              styles.navBtn,
              { borderColor: colors.line, backgroundColor: colors.card, opacity: next ? 1 : 0.45 },
            ]}
          >
            <Text style={{ color: colors.ink, fontSize: 13 }}>Neste</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.ink} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.line }]}>
        {DETAIL_TABS.map((tab) => {
          const active = tab.id === 'home';
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => onTab(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active && { borderBottomColor: colors.brand }]}
            >
              <Text style={{
                color: active ? colors.brand : colors.muted,
                fontWeight: active ? '600' : '500',
                fontSize: 14,
              }}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.columns, isPhone && styles.columnsPhone]}>
        <View style={[styles.mainCol, isPhone && styles.fullCol]}>
          <View
            style={[
              styles.panel,
              styles.heroPanel,
              { backgroundColor: colors.card, borderColor: colors.line },
              Platform.OS === 'web' ? styles.panelLift : null,
            ]}
          >
            <View style={styles.heroTop}>
              <Text style={[styles.panelKicker, { color: colors.muted }]}>Medarbeiderdetaljer</Text>
              <Pencil
                onPress={canEdit ? () => startSection('identity') : undefined}
                colors={colors}
                label="Rediger navn og kontakt"
              />
            </View>

            <View style={[styles.heroBody, isPhone && styles.heroBodyPhone]}>
              <View>
                {employee.person?.photoUrl ? (
                  <Image source={{ uri: employee.person.photoUrl }} style={styles.photo} />
                ) : (
                  <View style={[styles.photo, styles.photoFallback, { backgroundColor: colors.brandSoft }]}>
                    <Text style={{ color: colors.brand, fontSize: 32, fontWeight: '700' }}>{initials(employee)}</Text>
                  </View>
                )}
                {canEdit ? (
                  <TouchableOpacity
                    onPress={async () => {
                      await onPhoto?.();
                      startSection('identity');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Rediger bilde"
                    style={[styles.photoEdit, { backgroundColor: colors.card, borderColor: colors.line }]}
                  >
                    <Ionicons name="create-outline" size={16} color={colors.brand} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.heroFacts}>
                <Text style={[styles.heroName, { color: colors.ink }]}>{name}</Text>
                {!!contactLine(employee) && (
                  <Text style={{ color: colors.muted, fontSize: 13 }}>{contactLine(employee)}</Text>
                )}
                <View style={styles.chipRow}>
                  {employee.linkStatus === 'linked' ? (
                    <Text style={[styles.statusChip, { color: colors.ink, backgroundColor: colors.sunken }]}>
                      Knyttet profil
                    </Text>
                  ) : (
                    <Text style={[styles.statusChip, { color: colors.muted, backgroundColor: colors.sunken }]}>
                      Ikke knyttet
                    </Text>
                  )}
                  {depts.map((dept) => (
                    <Text key={dept} style={[styles.statusChip, { color: colors.ink, backgroundColor: colors.sunken }]}>
                      {dept}
                    </Text>
                  ))}
                </View>
                <View nativeID="employee-classification" style={styles.classify}>
                  <Text style={[styles.classifyLabel, { color: colors.muted }]}>Personell</Text>
                  <View style={styles.chipRow}>
                    {PERSONNEL_KIND_OPTIONS.map((option) => (
                      <FlagChip
                        key={option.value}
                        label={personnelKindLabel(option.value, companyName)}
                        on={personnelKind(employee) === option.value}
                        disabled={!canEdit || busy || !isAdmin}
                        onPress={canEdit && isAdmin ? () => onClassify?.({ personnelKind: option.value }) : undefined}
                        colors={colors}
                      />
                    ))}
                  </View>
                  <Text style={[styles.classifyLabel, { color: colors.muted }]}>Status</Text>
                  <View style={styles.chipRow}>
                    {STATUS_OPTIONS.map((option) => (
                      <FlagChip
                        key={option.value}
                        label={option.value === 'deleted' ? 'Papirkurv' : option.label}
                        on={(employee.company?.status || 'active') === option.value}
                        disabled={!canEdit || busy || !isAdmin}
                        onPress={canEdit && isAdmin ? () => onClassify?.({ status: option.value }) : undefined}
                        colors={colors}
                      />
                    ))}
                  </View>
                  <View style={styles.chipRow}>
                    <FlagChip
                      label="Kan logge inn"
                      on={!!employee.company?.canLogin}
                      disabled={!canEdit || busy || !isAdmin}
                      onPress={canEdit && isAdmin ? () => onClassify?.({ canLogin: !employee.company?.canLogin }) : undefined}
                      colors={colors}
                    />
                  </View>
                </View>
                {editingSection === 'identity' ? sectionEditor('identity') : null}
                <View style={styles.factList}>
                  {mainFacts.map((row, i) => (
                    <FactRow
                      key={row.key}
                      label={row.label}
                      value={row.value}
                      link={row.link}
                      colors={colors}
                      last={i === mainFacts.length - 1}
                      onEdit={row.key === 'company.accessRole'
                        ? (canEditAccess ? () => startField(row.key) : undefined)
                        : (canEdit && row.key !== 'kin' ? () => startField(row.key) : (canEdit ? () => startSection('kin') : undefined))}
                      editing={editingKey === row.key || (row.key === 'person.kinName' && editingSection === 'kin')}
                      editor={editingKey === row.key ? fieldEditor(row.key) : (row.key === 'person.kinName' && editingSection === 'kin' ? fieldEditor('person.kinName') : null)}
                    />
                  ))}
                </View>
              </View>
            </View>
            {isSelf ? (
              <View style={[styles.heroFooter, { borderTopColor: colors.line }]}>
                <TouchableOpacity
                  onPress={onPushProfile}
                  accessibilityRole="button"
                  style={[styles.secondaryBtn, { borderColor: colors.line, backgroundColor: colors.sunken }]}
                >
                  <Text style={{ color: colors.ink, fontSize: 13 }}>Bruk min profil her</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onPullToProfile}
                  accessibilityRole="button"
                  style={[styles.secondaryBtn, { borderColor: colors.line, backgroundColor: colors.sunken }]}
                >
                  <Text style={{ color: colors.ink, fontSize: 13 }}>Hent til min profil</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {editingKey && FIELDS.has(editingKey)
            && !mainFacts.some((row) => row.key === editingKey)
            && !personalRows.some((row) => row.key === editingKey)
            && !employmentRows.some((row) => row.key === editingKey)
            && editingKey !== 'company.workPercent'
            && editingKey !== 'company.periodFrom'
            && editingKey !== 'company.periodTo' ? (
              <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
                <Text style={[styles.sectionTitle, { color: colors.ink }]}>{FIELDS.get(editingKey)?.label || 'Rediger'}</Text>
                {fieldEditor(editingKey)}
              </View>
            ) : null}

          {personalRows.length || canEdit ? (
            <SectionCard
              title="Personlig data"
              icon="person-outline"
              colors={colors}
              open={openSections.personal}
              onToggle={() => toggle('personal')}
              badge={OWNER_LABEL.person}
              onEdit={canEdit ? () => startSection('personal') : undefined}
            >
              {editingSection === 'personal' || editingSection === 'address' ? (
                <>
                  {sectionEditor('personal')}
                  {editingSection === 'address' || editingSection === 'personal' ? sectionEditor('address') : null}
                </>
              ) : personalRows.map((row, i) => (
                <FactRow
                  key={row.key}
                  label={row.label}
                  value={row.value}
                  colors={colors}
                  last={i === personalRows.length - 1}
                  onEdit={canEdit ? () => startField(row.key) : undefined}
                  editing={editingKey === row.key}
                  editor={editingKey === row.key ? fieldEditor(row.key) : null}
                />
              ))}
            </SectionCard>
          ) : null}

          {employmentRows.length || canEdit ? (
            <SectionCard
              title="Ansettelsesdata"
              icon="briefcase-outline"
              colors={colors}
              open={openSections.employment}
              onToggle={() => toggle('employment')}
              badge={OWNER_LABEL.company}
              onEdit={canEdit && isAdmin ? () => startSection('employment') : undefined}
            >
              {editingSection === 'employment' ? sectionEditor('employment') : employmentRows.map((row, i) => (
                <FactRow
                  key={row.key}
                  label={row.label}
                  value={row.value}
                  colors={colors}
                  last={i === employmentRows.length - 1}
                  onEdit={canEdit && isAdmin ? () => startField(row.key) : undefined}
                  editing={editingKey === row.key}
                  editor={editingKey === row.key ? fieldEditor(row.key) : null}
                />
              ))}
            </SectionCard>
          ) : null}

          {workRows.length || canEdit ? (
            <SectionCard
              title="Arbeidsforhold"
              icon="time-outline"
              colors={colors}
              open={openSections.work}
              onToggle={() => toggle('work')}
              onEdit={canEdit && isAdmin ? () => startField('company.workPercent') : undefined}
            >
              {editingKey === 'company.workPercent' || editingKey === 'company.periodFrom' || editingKey === 'company.periodTo' ? (
                <>
                  {fieldEditor('company.workPercent')}
                  {fieldEditor('company.periodFrom')}
                  {fieldEditor('company.periodTo')}
                </>
              ) : (
                <View style={[styles.workTable, { borderColor: colors.line }]}>
                  <View style={[styles.workHead, { backgroundColor: colors.sunken, borderBottomColor: colors.line }]}>
                    <Text style={[styles.workCell, { color: colors.muted }]}>Arbeidsprosent</Text>
                    <Text style={[styles.workCell, styles.workGrow, { color: colors.muted }]}>Periode</Text>
                  </View>
                  <View style={styles.workBody}>
                    <Text style={[styles.workCell, { color: colors.ink }]}>
                      {employee.company?.workPercent ? `${employee.company.workPercent} %` : '—'}
                    </Text>
                    <Text style={[styles.workCell, styles.workGrow, { color: colors.ink }]}>
                      {periodLabel(employee) || '—'}
                    </Text>
                  </View>
                </View>
              )}
            </SectionCard>
          ) : null}

          {cvSections.length ? (
            <SectionCard
              title="CV-grunnlag"
              icon="document-text-outline"
              colors={colors}
              open={openSections.cvBits}
              onToggle={() => toggle('cvBits')}
              right={(
                <TouchableOpacity onPress={onCv} accessibilityRole="button">
                  <Text style={{ color: colors.brand, fontSize: 13 }}>Åpne CV</Text>
                </TouchableOpacity>
              )}
            >
              {cvSections.map(({ section, items }) => {
                const shown = items.slice(0, 3);
                const more = items.length - shown.length;
                return (
                  <View key={section.id} style={styles.cvBlock}>
                    <Text style={[styles.cvBlockTitle, { color: colors.ink }]}>
                      {`${section.title} (${items.length})`}
                    </Text>
                    {shown.map((item) => (
                      <Text key={item.id} style={{ color: colors.muted, fontSize: 14 }}>
                        {repeatSummary(section.id, item)}
                      </Text>
                    ))}
                    {more > 0 ? (
                      <TouchableOpacity onPress={onCv} accessibilityRole="button">
                        <Text style={{ color: colors.brand, fontSize: 13 }}>{`og ${more} til i CV-en`}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
            </SectionCard>
          ) : null}

          {customFields.length ? (
            <SectionCard
              title="Egne felt"
              icon="pricetags-outline"
              colors={colors}
              open={openSections.custom}
              onToggle={() => toggle('custom')}
            >
              {customFields.map((field, i) => (
                <FactRow
                  key={field.id}
                  label={field.label}
                  value={field.value}
                  colors={colors}
                  last={i === customFields.length - 1}
                />
              ))}
            </SectionCard>
          ) : null}

          {gaps ? (
            <SectionCard
              title="Mangler"
              icon="alert-circle-outline"
              colors={colors}
              open={openSections.gaps}
              onToggle={() => toggle('gaps')}
            >
              {!gaps.register.length && !gaps.person.length && !gaps.cv.length ? (
                <Text style={{ color: colors.muted }}>Påkrevde felt og CV-grunnlag er fylt ut.</Text>
              ) : null}
              {!!gaps.register.length && (
                <GapList
                  title="Må fylles ut"
                  items={gaps.register}
                  colors={colors}
                  onEdit={canEdit ? (item) => startField(item.key) : undefined}
                />
              )}
              {!!gaps.person.length && (
                <GapList
                  title="Den ansatte fyller ut"
                  items={gaps.person}
                  colors={colors}
                  onEdit={canEdit ? (item) => startField(item.key) : undefined}
                />
              )}
              {!!gaps.cv.length && (
                <GapList
                  title="Trengs til CV"
                  items={gaps.cv}
                  colors={colors}
                  onEdit={canEdit ? (item) => startField(item.key) : undefined}
                />
              )}
            </SectionCard>
          ) : null}

          {isAdmin ? (
            isDeletedEmployee(employee) ? (
              <View style={styles.inlineActions}>
                <TouchableOpacity
                  onPress={onRestore}
                  accessibilityRole="button"
                  accessibilityLabel="Gjenopprett"
                  style={[styles.secondaryBtn, { borderColor: colors.line, backgroundColor: colors.sunken }]}
                >
                  <Text style={{ color: colors.ink, fontSize: 13 }}>Gjenopprett</Text>
                </TouchableOpacity>
                {confirmDelete ? (
                  <>
                    <TouchableOpacity
                      onPress={onDestroy}
                      accessibilityRole="button"
                      style={[styles.dangerBtn, { backgroundColor: colors.danger || '#b42318' }]}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600' }}>Slett permanent</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onCancelDelete} accessibilityRole="button">
                      <Text style={{ color: colors.ink }}>Avbryt</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity onPress={onConfirmDelete} accessibilityRole="button" style={styles.deleteLink}>
                    <Text style={{ color: colors.danger || '#b42318' }}>Slett permanent</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : confirmDelete ? (
              <View style={styles.inlineActions}>
                <TouchableOpacity
                  onPress={onDestroy}
                  accessibilityRole="button"
                  style={[styles.dangerBtn, { backgroundColor: colors.danger || '#b42318' }]}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Flytt til papirkurv</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onCancelDelete} accessibilityRole="button">
                  <Text style={{ color: colors.ink }}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={onConfirmDelete} accessibilityRole="button" style={styles.deleteLink}>
                <Text style={{ color: colors.danger || '#b42318' }}>Flytt til papirkurv</Text>
              </TouchableOpacity>
            )
          ) : null}
        </View>

        <View style={[styles.sideCol, isPhone && styles.fullCol]}>
          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={styles.sideHead}>
              <Text style={[styles.sideTitle, { color: colors.ink }]}>Prosjekter</Text>
              <TouchableOpacity
                onPress={() => setOnlyActive((value) => !value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: onlyActive }}
                style={styles.activeCheck}
              >
                <View style={[
                  styles.checkBox,
                  { borderColor: onlyActive ? colors.brand : colors.muted },
                  onlyActive && { backgroundColor: colors.brand },
                ]}
                >
                  {onlyActive ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
                </View>
                <Text style={{ color: colors.ink, fontSize: 13 }}>Kun aktive</Text>
              </TouchableOpacity>
            </View>
            {!projectGroups.length ? (
              <Text style={{ color: colors.muted, fontSize: 14 }}>
                {onlyActive ? 'Ingen aktive prosjekter.' : 'Ingen prosjekter er registrert.'}
              </Text>
            ) : (
              projectGroups.map((group) => (
                <View key={group.role} style={styles.projectGroup}>
                  <View style={styles.projectGroupHead}>
                    <Ionicons name="remove-outline" size={16} color={colors.brand} />
                    <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 14 }}>{group.role}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{group.items.length}</Text>
                  </View>
                  {group.items.map((project) => (
                    <TouchableOpacity
                      key={`${group.role}:${project.id}`}
                      onPress={() => (onOpenProject ? onOpenProject(project) : onCv?.())}
                      accessibilityRole="button"
                      style={[styles.projectRow, { borderTopColor: colors.line }]}
                    >
                      <Text style={{ color: colors.ink, flex: 1, fontSize: 14 }}>{projectLine(project)}</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.muted} />
                    </TouchableOpacity>
                  ))}
                </View>
              ))
            )}
            {(employee.cv?.projects || []).length > 0 ? (
              <TouchableOpacity onPress={onCv} accessibilityRole="button" style={{ marginTop: 8 }}>
                <Text style={{ color: colors.brand, fontSize: 13 }}>Vis alle i CV…</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.sideTitle, { color: colors.ink }]}>Tagger</Text>
            {tags.length ? (
              <View style={styles.chipRow}>
                {tags.map((tag) => (
                  <Text key={tag} style={[styles.tagChip, { color: colors.ink, backgroundColor: colors.sunken, borderColor: colors.line }]}>
                    {tag}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={{ color: colors.muted, fontSize: 14 }}>Ingen avdelinger eller rettigheter er satt.</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, width: '100%' },
  crumbRow: { flexDirection: 'row', alignItems: 'center' },
  crumbBtn: { paddingVertical: 2 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  titleRowPhone: { flexDirection: 'column' },
  titleBlock: { flex: 1, gap: 4, minWidth: 180 },
  name: { fontSize: 28, fontWeight: '700', letterSpacing: -0.3 },
  navActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  columnsPhone: { flexDirection: 'column' },
  mainCol: { flex: 1.65, gap: 12, minWidth: 0 },
  sideCol: {
    flex: 1,
    gap: 12,
    minWidth: 260,
    maxWidth: 380,
    ...(Platform.OS === 'web' ? { position: 'sticky', top: 12, alignSelf: 'flex-start' } : {}),
  },
  fullCol: { maxWidth: '100%', width: '100%', minWidth: 0, position: 'relative', top: 0 },
  heroFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  panel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  panelLift: Platform.OS === 'web'
    ? { boxShadow: '0 8px 24px rgba(7, 39, 76, 0.06)' }
    : {},
  heroPanel: { gap: 16 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  panelKicker: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  heroBody: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  heroBodyPhone: { flexDirection: 'column' },
  photo: { width: 132, height: 154, borderRadius: 10 },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  photoEdit: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    borderWidth: 1,
    borderRadius: 8,
    padding: 4,
  },
  heroFacts: { flex: 1, gap: 8, minWidth: 0 },
  heroName: { fontSize: 22, fontWeight: '700', letterSpacing: -0.2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusChip: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  factList: { marginTop: 4 },
  factRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 9,
    alignItems: 'flex-start',
  },
  factLabel: { width: '34%', maxWidth: 160, minWidth: 110, fontSize: 13, lineHeight: 20 },
  factValue: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  factValueCol: { flex: 1, minWidth: 0, gap: 8 },
  factValueRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  factValueGrow: { flex: 1, minWidth: 0 },
  pencil: { padding: 2, marginTop: 1 },
  flagChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  classify: { gap: 8, marginTop: 4 },
  classifyLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },
  inlineEditor: { gap: 8, flex: 1, minWidth: 0 },
  saveBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  sectionHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  badge: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '600',
  },
  sectionBody: { gap: 0 },
  workTable: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  workHead: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  workBody: { flexDirection: 'row' },
  workCell: { width: 130, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  workGrow: { flex: 1, width: 'auto' },
  cvBlock: { gap: 4, paddingBottom: 10 },
  cvBlockTitle: { fontSize: 14, fontWeight: '600' },
  gapBlock: { gap: 4, paddingBottom: 8 },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dangerBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  deleteLink: { alignSelf: 'flex-start', paddingVertical: 4 },
  sideHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  sideTitle: { fontSize: 17, fontWeight: '700' },
  activeCheck: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  checkBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectGroup: { gap: 0 },
  projectGroupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tagChip: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
});
