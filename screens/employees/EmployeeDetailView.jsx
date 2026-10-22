import React, { useEffect, useMemo, useState } from 'react';
import {
  Image, Linking, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { accessLevelSections, accessSectionTitle, employeeLevelIds, levelById, placedLevelId, withToggledLevel } from '../../src/access/companyAccess';
import { inviteStatusLabel } from '../../src/employees/invite';
import {
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
} from '../../src/employees/model';
import {
  FORM_SECTIONS, OWNER_LABEL,
} from '../../src/employees/schema';
import EmployeeFields, { EmployeeField } from './EmployeeFields';
import { useLayout } from '../../src/theme';
import {
  emptyProjectState,
  monthsAgoIso,
  projectsWithEmployeeHours,
} from '../../src/project/engine';

const MAIN_FACT_KEYS = [
  'company.title',
  'company.projectRole',
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

function workProjectTitle(project) {
  const number = project?.number ? `#${project.number} ` : '';
  return `${number}${project?.name || project?.title || 'Prosjekt'}`.trim();
}

function workProjectMeta(project) {
  const parts = [];
  if (project?.client) parts.push(project.client);
  if (project?.recentHours) parts.push(`${project.recentHours} t`);
  return parts.join(' · ');
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

const ACCESS_SYMBOLS = {
  regnskap_ekstern: 'calculator-outline',
  innleie_ekstern: 'time-outline',
  ansatt: 'person-outline',
  tilbud: 'document-text-outline',
  ansatt_andre_avdelinger: 'git-network-outline',
  avdelingsleder: 'people-outline',
  leder: 'ribbon-outline',
  administrator: 'shield-checkmark-outline',
};

function AccessCorner({ employee, colors }) {
  const selectedIds = employeeLevelIds(employee);
  const currentId = placedLevelId(employee);
  const symbol = ACCESS_SYMBOLS[currentId] || 'ellipse-outline';
  const deactivated = accountDeactivated(employee);
  const label = deactivated
    ? 'Deaktivert. Ingen rettigheter.'
    : (selectedIds.map((id) => levelById(id)?.label).filter(Boolean).join(', ') || 'Ikke valgt');
  return (
    <View nativeID="employee-access-level" style={styles.accessCorner}>
      <View
        accessibilityLabel={label}
        style={[styles.accessSymbol, {
          borderColor: deactivated ? colors.muted : colors.brand,
          backgroundColor: deactivated ? colors.sunken : colors.brandSoft,
          opacity: deactivated ? 0.7 : 1,
        }]}
      >
        <Ionicons name={symbol} size={18} color={deactivated ? colors.muted : colors.brand} />
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, maxWidth: 140 }}>{label}</Text>
    </View>
  );
}

function accountDeactivated(employee) {
  const status = employee?.company?.status || 'active';
  return status === 'inactive' || status === 'deleted' || status === 'former';
}

function EmploymentChips({ employee, colors, companyName, busy, canEdit, canEditAccess, isAdmin, onClassify }) {
  const deactivated = accountDeactivated(employee);
  const locked = !canEdit || busy || !isAdmin;
  const levelLocked = deactivated || !canEditAccess || busy;
  const selected = employeeLevelIds(employee);
  const danger = colors.danger || '#dc2626';
  const success = colors.success || '#16a34a';
  function toggleLevel(levelId) {
    if (levelLocked) return;
    const next = withToggledLevel(employee, levelId, !selected.includes(levelId));
    onClassify?.({ accessLevels: next.company?.accessLevels || [] });
  }
  return (
    <View nativeID="employee-classification" style={styles.classify}>
      <Text style={[styles.classifyLabel, { color: colors.muted }]}>Konto</Text>
      <View style={[styles.accountSwitch, { borderColor: deactivated ? danger : colors.line }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Aktiv konto"
          accessibilityState={{ selected: !deactivated }}
          disabled={locked}
          onPress={() => onClassify?.({ status: 'active' })}
          style={[styles.accountSide, !deactivated && { backgroundColor: colors.successSoft || '#e4f5ea' }]}
        >
          <Text style={{ color: !deactivated ? success : colors.muted, fontWeight: '700' }}>Aktiv</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Deaktivert konto"
          accessibilityState={{ selected: deactivated }}
          disabled={locked}
          onPress={() => onClassify?.({ status: 'inactive', canLogin: false })}
          style={[styles.accountSide, deactivated && { backgroundColor: danger }]}
        >
          <Text style={{ color: deactivated ? '#fff' : colors.muted, fontWeight: '700' }}>Deaktivert</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ color: deactivated ? danger : colors.muted, fontSize: 13, lineHeight: 18 }}>
        {deactivated
          ? 'Deaktivert. Ingen rettigheter.'
          : 'Kontoen er aktiv.'}
      </Text>
      <Text style={[styles.classifyLabel, { color: colors.muted }]}>Personell</Text>
      <Text style={{ color: colors.ink, fontSize: 15 }}>{personnelKindLabel(personnelKind(employee), companyName)}</Text>
      <Text style={[styles.classifyLabel, { color: colors.muted }]}>Rettigheter</Text>
      <Text style={{ color: deactivated ? danger : colors.muted, fontSize: 13, lineHeight: 18 }}>
        {deactivated
          ? 'Deaktivert. Ingen rettigheter. De skraverte nivåene er de personen hadde.'
          : 'Kryss av nivåene som passer for denne ansatte. Rettighetene fra alle avhukede nivå gjelder.'}
      </Text>
      {accessLevelSections().map((section) => (
        <View key={section.id} nativeID={`employee-levels-${section.id}`} style={styles.levelGroup}>
          <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>
            {accessSectionTitle(section.id, companyName)}
          </Text>
          {section.levels.map((level) => {
            const on = selected.includes(level.id);
            return (
              <TouchableOpacity
                key={level.id}
                nativeID={`employee-level-${employee.id}-${level.id}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: levelLocked }}
                accessibilityLabel={level.label}
                disabled={levelLocked}
                onPress={() => toggleLevel(level.id)}
                style={styles.levelChoice}
              >
                <View style={[
                  styles.levelBox,
                  {
                    borderColor: on ? (deactivated ? colors.muted : colors.brand) : colors.line,
                    backgroundColor: on ? (deactivated ? (colors.sunken || '#f8fafc') : colors.brand) : colors.card,
                    borderStyle: deactivated ? 'dashed' : 'solid',
                    opacity: deactivated ? 0.72 : (levelLocked ? 0.6 : 1),
                  },
                ]}
                >
                  {on ? (
                    deactivated
                      ? <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 14 }}>✓</Text>
                      : <Ionicons name="checkmark" size={12} color="#fff" />
                  ) : null}
                </View>
                <Text style={{ color: deactivated ? colors.muted : colors.ink, fontSize: 15, flex: 1 }}>{level.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      {!deactivated ? (
        <View style={styles.chipRow}>
          <FlagChip
            label="Kan logge inn"
            on={!!employee.company?.canLogin}
            disabled={locked}
            onPress={!locked ? () => onClassify?.({ canLogin: !employee.company?.canLogin }) : undefined}
            colors={colors}
          />
        </View>
      ) : null}
    </View>
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
  confirmDelete = false,
  busy = false,
  onCv,
  onHours,
  onOpenProject,
  projectState = null,
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
  canInvite = false,
  onInvite,
  // Lese på ansatte: bare grunnkortet, uten personlig data, arbeidsforhold, mangler og tagger.
  limited = false,
  // Mangler og Tagger er bare for Admin på ansatte (og personen selv).
  showAdminCards = true,
  // Papirkurv og permanent sletting krever Admin på ansatte.
  canDelete = isAdmin,
  // 'home' = hovedsiden, 'employment' = Ansettelsesdata under Innstillinger.
  section = 'home',
}) {
  const { isPhone } = useLayout();
  const [editingKey, setEditingKey] = useState('');
  const [editingSection, setEditingSection] = useState('');
  const [extraDepartment, setExtraDepartment] = useState('');
  const [recentOnly, setRecentOnly] = useState(true);
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
    setRecentOnly(true);
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

  const name = displayName(employee);
  const deactivated = accountDeactivated(employee);
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
      { key: 'company.employmentType', label: 'Type ansatt', value: employee.company?.employmentType },
      { key: 'company.compensationType', label: 'Type lønnskompensasjon', value: employee.company?.compensationType },
    ];
    return canEdit ? rows : rows.filter((row) => row.value);
  }, [employee, canEdit]);

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

  const visibleWorkProjects = useMemo(() => {
    const state = projectState || emptyProjectState();
    if (recentOnly) {
      return projectsWithEmployeeHours(state, employee.id, { since: monthsAgoIso(3) });
    }
    return projectsWithEmployeeHours(state, employee.id, {
      since: '',
      includeMembership: true,
    });
  }, [projectState, employee.id, recentOnly]);

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

  const employmentCard = (
          <SectionCard
            title="Ansettelsesdata"
            icon="briefcase-outline"
            colors={colors}
            open={openSections.employment}
            onToggle={() => toggle('employment')}
            badge={OWNER_LABEL.company}
            onEdit={canEdit && isAdmin ? () => startSection('employment') : undefined}
          >
            <EmploymentChips
              employee={employee}
              colors={colors}
              companyName={companyName}
              busy={busy}
              canEdit={canEdit}
              canEditAccess={canEditAccess}
              isAdmin={isAdmin}
              onClassify={onClassify}
            />
            {editingSection === 'employment' ? sectionEditor('employment') : (
              <>
                {employmentRows.map((row, i) => (
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
              </>
            )}
          </SectionCard>
  );

  if (section === 'employment') {
    return (
      <View nativeID="employee-employment" style={styles.root}>
        {employmentCard}
      </View>
    );
  }

  return (
    <View nativeID="employee-detail" style={styles.root}>
      <View style={[styles.columns, isPhone && styles.columnsPhone]}>
        <View style={[styles.mainCol, isPhone && styles.stackCol]}>
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
              <View style={styles.heroActions}>
                <Pencil
                  onPress={canEdit ? () => startSection('identity') : undefined}
                  colors={colors}
                  label="Rediger navn og kontakt"
                />
                <AccessCorner employee={employee} colors={colors} />
              </View>
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
                  {inviteStatusLabel(employee.invite?.status) ? (
                    <Text style={[styles.statusChip, { color: colors.ink, backgroundColor: colors.sunken }]}>
                      {inviteStatusLabel(employee.invite?.status)}
                    </Text>
                  ) : null}
                  {depts.map((dept) => (
                    <Text key={dept} style={[styles.statusChip, { color: colors.ink, backgroundColor: colors.sunken }]}>
                      {dept}
                    </Text>
                  ))}
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
            {canInvite && employee.invite?.status !== 'accepted' && !isDeletedEmployee(employee) ? (
              <View style={[styles.heroFooter, { borderTopColor: colors.line }]}>
                <TouchableOpacity
                  onPress={onInvite}
                  disabled={busy}
                  accessibilityRole="button"
                  style={[styles.secondaryBtn, { borderColor: colors.line, backgroundColor: colors.sunken, opacity: busy ? 0.6 : 1 }]}
                >
                  <Text style={{ color: colors.ink, fontSize: 13 }}>
                    {employee.invite?.status === 'sent' ? 'Send invitasjon på nytt' : 'Inviter'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
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

          {!limited && (personalRows.length || canEdit) ? (
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


          {!limited && (workRows.length || canEdit) ? (
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
              right={limited ? null : (
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
                    {more > 0 && !limited ? (
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

          {gaps && !limited && showAdminCards ? (
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

          {canDelete ? (
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

        <View style={[styles.sideCol, isPhone ? styles.stackCol : styles.sideColSticky]}>
          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={styles.sideHead}>
              <Text style={[styles.sideTitle, { color: colors.ink }]}>Prosjekter</Text>
              <TouchableOpacity
                onPress={() => setRecentOnly((value) => !value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: recentOnly }}
                style={styles.activeCheck}
              >
                <View style={[
                  styles.checkBox,
                  { borderColor: recentOnly ? colors.brand : colors.muted },
                  recentOnly && { backgroundColor: colors.brand },
                ]}
                >
                  {recentOnly ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
                </View>
                <Text style={{ color: colors.ink, fontSize: 13 }}>Siste 3 mnd</Text>
              </TouchableOpacity>
            </View>
            {!visibleWorkProjects.length ? (
              <Text style={{ color: colors.muted, fontSize: 14 }}>
                {recentOnly
                  ? 'Ingen timer ført på prosjekt de siste 3 månedene.'
                  : 'Ingen prosjektmedlemskap eller timer er registrert.'}
              </Text>
            ) : (
              <View style={styles.projectGroup}>
                {visibleWorkProjects.map((project) => {
                  const meta = workProjectMeta(project);
                  return (
                    <TouchableOpacity
                      key={project.id}
                      onPress={() => onOpenProject?.(project)}
                      accessibilityRole="button"
                      style={[styles.projectRow, { borderTopColor: colors.line }]}
                    >
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text style={{ color: colors.ink, fontSize: 14 }} numberOfLines={2}>
                          {workProjectTitle(project)}
                        </Text>
                        {meta ? (
                          <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                            {meta}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={colors.muted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {onHours && !limited ? (
              <TouchableOpacity
                onPress={onHours}
                accessibilityRole="button"
                accessibilityLabel="Åpne timeføring"
                nativeID="employee-open-hours"
                style={{ marginTop: 8 }}
              >
                <Text style={{ color: colors.brand, fontSize: 13 }}>Åpne timeføring…</Text>
              </TouchableOpacity>
            ) : null}
            {!limited && (employee.cv?.projects || []).length > 0 ? (
              <TouchableOpacity onPress={onCv} accessibilityRole="button" style={{ marginTop: 8 }}>
                <Text style={{ color: colors.brand, fontSize: 13 }}>Vis referanseprosjekter i CV…</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {limited || !showAdminCards ? null : (
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
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, width: '100%' },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  columnsPhone: { flexDirection: 'column', alignItems: 'stretch' },
  mainCol: { flex: 1.65, gap: 12, minWidth: 0 },
  sideCol: {
    flex: 1,
    gap: 12,
    minWidth: 260,
    maxWidth: 380,
  },
  // Sticky only on wide layouts. On phone, sticky + flex:1 inside ScrollView
  // collapses column height so Prosjekter/Tagger paint over Arbeidsforhold.
  sideColSticky: Platform.OS === 'web'
    ? { position: 'sticky', top: 12, alignSelf: 'flex-start' }
    : { alignSelf: 'flex-start' },
  stackCol: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    maxWidth: '100%',
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    position: 'relative',
    top: 0,
  },
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
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  heroActions: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  accessCorner: { alignItems: 'flex-end', gap: 8 },
  accessCornerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  accessSymbol: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  accessGear: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  accessMenu: { borderWidth: 1, borderRadius: 12, padding: 8, gap: 4, minWidth: 220 },
  accessOption: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8 },
  levelBox: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  levelGroup: { gap: 4, marginTop: 4 },
  levelChoice: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
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
  accountSwitch: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  accountSide: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
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
