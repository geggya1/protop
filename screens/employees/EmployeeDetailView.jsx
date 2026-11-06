import React, { useEffect, useMemo, useState } from 'react';
import StorageImage from '../../components/StorageImage';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  accountDeactivated, employeeLevelIds, levelById, placedLevelId,
} from '../../src/access/companyAccess';
import { employeeInviteState, inviteStatusLabel } from '../../src/employees/invite';
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
import ChildCareCard from '../../components/employees/ChildCareCard';
import { useBreakpoints } from '../../src/theme';

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

/** Alt i persondata-vinduet fra hovedsiden. 'kin' (eget pårørendekort) bare når det bes om. */
export const PROFILE_PARTS = ['identity', 'personal', 'work', 'childCare', 'custom', 'gaps'];

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
  showName = true,
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
  // Sluttdatoen avslutter ansettelsen når den passeres: Admin på Ansatte (REV-07).
  canEndEmployment = true,
  isAdmin = false,
  isSelf = false,
  // Bedriften og innlogget bruker (barna lagres skjermet per bedrift).
  companyId = '',
  currentUid = '',
  confirmDelete = false,
  busy = false,
  onChange,
  onSave,
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
  // 'profile' = persondata i redigeringsvinduet fra hovedsiden,
  // 'account' = tagger og papirkurv under Innstillinger › Brukerkonto,
  // 'employment' = Ansettelsesdata under Innstillinger.
  section = 'profile',
  // Delene av persondata som vises (Innstillinger viser én del per seksjon).
  // Uten parts: alt, slik redigeringsvinduet fra hovedsiden viser det.
  parts = null,
  // Familievinduet på Gjøremål åpner barna rett i redigering.
  childCareEditing = false,
  onChildCareSaved,
}) {
  const show = (id) => (parts || PROFILE_PARTS).includes(id);
  const { isPhone } = useBreakpoints();
  const [editingKey, setEditingKey] = useState('');
  const [editingSection, setEditingSection] = useState('');
  const [extraDepartment, setExtraDepartment] = useState('');
  const [openSections, setOpenSections] = useState({
    personal: true,
    employment: true,
    work: true,
    cvBits: false,
    custom: true,
    gaps: true,
    projects: true,
    childCare: true,
  });

  useEffect(() => {
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
      childCare: true,
    });
  }, [employee?.id]);

  const name = displayName(employee);
  const inviteState = employeeInviteState(employee);
  const inviteLabel = canInvite ? inviteState.label : inviteStatusLabel(employee.invite?.status);
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

  const kinRows = useMemo(() => {
    if (!reveal) return [];
    const person = employee.person || {};
    const phone = String(person.kinPhone || '').trim();
    const email = String(person.kinEmail || '').trim();
    const rows = [
      { key: 'person.kinName', label: 'Navn', value: person.kinName },
      { key: 'person.kinPhone', label: 'Telefon', value: phone, link: phone ? `tel:${phone.replace(/\s+/g, '')}` : '' },
      { key: 'person.kinEmail', label: 'E-post', value: email, link: email ? `mailto:${email}` : '' },
      { key: 'person.kinNote', label: 'Merknad', value: person.kinNote },
    ];
    return rows.filter((row) => String(row.value || '').trim());
  }, [employee, reveal]);

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

  // Status og sluttdato avslutter eller åpner ansettelsen: bare med Admin på Ansatte (REV-07).
  const employmentLocked = canEndEmployment ? [] : ['company.status', 'company.periodTo'];

  function fieldEditor(fieldKey) {
    return (
      <InlineEditor
        fieldKey={fieldKey}
        employee={employee}
        colors={colors}
        canEditOwner={canEditOwner}
        lockedKeys={[...(canEditAccess ? [] : ['company.accessRole']), ...employmentLocked]}
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
          lockedKeys={employmentLocked}
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

  // Bare ansettelsesdata. Konto, invitasjon og rettigheter ligger under Brukerkonto.
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
            {editingSection === 'employment' ? sectionEditor('employment') : (
              <>
                <FactRow
                  label="Personell"
                  value={personnelKindLabel(personnelKind(employee), companyName)}
                  colors={colors}
                  last={!employmentRows.length}
                />
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

  const workCard = !limited && (workRows.length || canEdit) ? (
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
          ) : null;

  if (section === 'employment') {
    return (
      <View nativeID="employee-employment" style={styles.root}>
        {employmentCard}
        {workCard}
      </View>
    );
  }

  const deleteControls = canDelete ? (
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
              style={[styles.dangerBtn, { backgroundColor: colors.danger }]}
            >
              <Text style={{ color: colors.onBrand, fontWeight: '600' }}>Slett permanent</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancelDelete} accessibilityRole="button">
              <Text style={{ color: colors.ink }}>Avbryt</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity onPress={onConfirmDelete} accessibilityRole="button" style={styles.deleteLink}>
            <Text style={{ color: colors.danger }}>Slett permanent</Text>
          </TouchableOpacity>
        )}
      </View>
    ) : confirmDelete ? (
      <View style={styles.inlineActions}>
        <TouchableOpacity
          onPress={onDestroy}
          accessibilityRole="button"
          style={[styles.dangerBtn, { backgroundColor: colors.danger }]}
        >
          <Text style={{ color: colors.onBrand, fontWeight: '600' }}>Flytt til papirkurv</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancelDelete} accessibilityRole="button">
          <Text style={{ color: colors.ink }}>Avbryt</Text>
        </TouchableOpacity>
      </View>
    ) : (
      <TouchableOpacity onPress={onConfirmDelete} accessibilityRole="button" style={styles.deleteLink}>
        <Text style={{ color: colors.danger }}>Flytt til papirkurv</Text>
      </TouchableOpacity>
    )
  ) : null;

  // Innstillinger › Brukerkonto: tagger og papirkurv. Flyttet hit fra hovedsiden.
  if (section === 'account') {
    return (
      <View nativeID="employee-account-extra" style={styles.root}>
        {showAdminCards ? (
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
        ) : null}
        {deleteControls ? (
          <View nativeID="employee-account-delete" style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.sideTitle, { color: colors.ink }]}>{isDeletedEmployee(employee) ? 'I papirkurven' : 'Fjern medarbeideren'}</Text>
            {deleteControls}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View nativeID="employee-detail" style={styles.root}>
      <View>
        <View style={styles.profileCol}>
          {show('identity') ? (
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
                  <StorageImage uri={employee.person.photoUrl} style={styles.photo} />
                ) : (
                  <View style={[styles.photo, styles.photoFallback, { backgroundColor: colors.brandSoft }]}>
                    <Text style={{ color: colors.brand, fontSize: 32, fontWeight: '600' }}>{initials(employee)}</Text>
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
                {/* Navnet står i toppfeltet over fanene. Bare vist her når kortet står alene. */}
                {showName ? <Text style={[styles.heroName, { color: colors.ink }]}>{name}</Text> : null}
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
                  {inviteLabel ? (
                    <Text nativeID="employee-invite-status" style={[styles.statusChip, { color: colors.ink, backgroundColor: colors.sunken }]}>
                      {inviteLabel}
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
            {isSelf && onPushProfile ? (
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
          ) : null}

          {show('kin') ? (
            <SectionCard
              title="Nærmeste pårørende"
              icon="people-outline"
              colors={colors}
              open
              onToggle={() => {}}
              badge={OWNER_LABEL.person}
              onEdit={canEdit ? () => startSection('kin') : undefined}
            >
              {editingSection === 'kin' ? sectionEditor('kin') : (
                <>
                  {kinRows.map((row, i) => (
                    <FactRow
                      key={row.key}
                      label={row.label}
                      value={row.value}
                      link={row.link}
                      colors={colors}
                      last={i === kinRows.length - 1}
                    />
                  ))}
                  {!kinRows.length ? (
                    <Text style={{ color: colors.muted, fontSize: 14 }}>Ingen pårørende er registrert.</Text>
                  ) : null}
                </>
              )}
            </SectionCard>
          ) : null}

          {show('identity') && editingKey && FIELDS.has(editingKey)
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

          {show('personal') && !limited && (personalRows.length || canEdit) ? (
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


          {show('work') ? workCard : null}

          {show('childCare') && !limited && (isAdmin || isSelf) && section === 'profile' && companyId ? (
            <SectionCard
              title="Barn og omsorgsdager"
              icon="happy-outline"
              colors={colors}
              open={openSections.childCare}
              onToggle={() => toggle('childCare')}
            >
              <ChildCareCard
                companyId={companyId}
                employee={employee}
                colors={colors}
                canEdit={!!canEdit}
                self={!!isSelf}
                by={currentUid}
                startEditing={childCareEditing}
                onSaved={onChildCareSaved}
              />
            </SectionCard>
          ) : null}

          {show('custom') && customFields.length ? (
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

          {show('gaps') && gaps && !limited && showAdminCards ? (
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

        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, width: '100%' },
  profileCol: { gap: 12, minWidth: 0 },
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
  heroName: { fontSize: 22, fontWeight: '600', letterSpacing: -0.2 },
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
  sideTitle: { fontSize: 17, fontWeight: '600' },
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
