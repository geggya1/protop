import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ConfirmDialog from '../../components/ConfirmDialog';
import DateField from '../../components/DateField';
import {
  addContractDocuments,
  addDelivery,
  attachContractDocumentFile,
  closeContract,
  deleteContract,
  exerciseOption,
  purgeContract,
  setDeliveryStatus,
  setMilestoneDue,
  restoreContract,
  setMilestoneStatus,
  updateContractDetails,
} from '../../src/anbud/lifecycle';
import {
  AGREEMENT_KINDS,
  RENEWAL_TYPES,
  childAgreements,
  coverFromRecord,
  kindLabel,
  parentOptions,
} from '../../src/anbud/agreementTemplate';
import { contractStatusLabel } from '../../src/anbud/directContract';
import { uploadAgreementFile } from '../../src/anbud/contractFiles';
import { formatNok } from '../../src/anbud/model';
import {
  customerDraftFromBrreg,
  formatOrgnr,
  maskPersonnummer,
  normalizeOrgnr,
  setCustomerOwner,
} from '../../src/anbud/customers';
import { indexLabel } from '../../src/anbud/fieldReview';
import { formatNumberId } from '../../src/anbud/numbering';
import { documentHasOriginalFile, documentIsOpenable, openAgreementDocument } from '../../src/anbud/openDocument';
import { loadAnbudState } from '../../src/anbud/storage';
import { INDEX_SERIES } from '../../src/indeksregulering/catalog';
import { searchBrregCompanies } from '../../src/utils/boligmappaApis';
import { pickDocument } from '../../src/utils/media';
import { dateKey } from '../../src/utils/dates';
import { useLayout } from '../../src/theme';
import AgreementAssigneesField from './AgreementAssigneesField';
import AgreementCustomerField from './AgreementCustomerField';
import AgreementDocumentPreview from './AgreementDocumentPreview';
import AgreementPersonField from './AgreementPersonField';
import AgreementProjectField from './AgreementProjectField';

const DOC_ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const INVOICE_METHODS = [
  { id: 'EPOST', label: 'E-post' },
  { id: 'EHF', label: 'EHF' },
  { id: 'POST', label: 'Post' },
];

function isoFromDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return dateKey(value) || '';
}

function Section({ colors, title, open, onToggle, children, actions = null }) {
  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <TouchableOpacity onPress={onToggle} accessibilityRole="button" style={styles.head}>
        <Text style={{ color: colors.ink, fontWeight: '700', flex: 1, fontSize: 16 }}>{title}</Text>
        {actions}
        <Text style={{ color: colors.muted }}>{open ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

function shownValue(value) {
  return value == null ? '' : String(value).trim();
}

function invoiceLabel(value) {
  const id = String(value || '').trim().toUpperCase();
  if (id === 'EPOST') return 'E-post';
  if (id === 'EHF') return 'EHF';
  if (id === 'POST') return 'Post';
  return String(value || '').trim();
}

function Fact({ colors, label, value }) {
  const shown = shownValue(value);
  if (!shown) return null;
  return (
    <View style={[styles.factRow, { borderBottomColor: colors.line }]}>
      <Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.ink }]}>{shown}</Text>
    </View>
  );
}

function FieldGroup({ colors, title, rows }) {
  const visible = rows.filter((row) => shownValue(row?.value));
  if (!visible.length) return null;
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.groupTitle}>{title}</Text>
      {visible.map((row) => (
        <Fact key={row.label} colors={colors} label={row.label} value={row.value} />
      ))}
    </View>
  );
}

function EditField({
  colors,
  label,
  value,
  onChange,
  multiline = false,
  keyboardType = 'default',
  placeholder = '',
  hint = '',
}) {
  return (
    <View style={[styles.fact, multiline && styles.factWide]}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[
          styles.input,
          multiline && styles.inputMulti,
          { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg },
        ]}
      />
      {hint ? <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

function DateEdit({ colors, label, value, onChange }) {
  return (
    <View style={styles.fact}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <View style={[styles.dateBox, { borderColor: colors.line, backgroundColor: colors.bg }]}>
        <DateField
          value={value || null}
          onChange={(date) => onChange(isoFromDate(date))}
          placeholder="Velg dato"
          iconColor={colors.brand}
          style={styles.dateField}
          textStyle={{ color: value ? colors.ink : colors.placeholder, fontSize: 15 }}
        />
      </View>
    </View>
  );
}

export default function AgreementDetail({
  contract,
  contracts = [],
  customer = null,
  customers = [],
  projects = [],
  people = [],
  employees = [],
  colors,
  companyId,
  onCommit,
  onBack,
  onOpenProject,
  onOpenIndex,
  onOpenCustomer,
  onCustomersChanged,
  onOpenAgreement,
  onNewChild,
  onDeleted,
  onPurged,
  canPurge = false,
}) {
  const [dates, setDates] = useState({});
  const [delivery, setDelivery] = useState({ title: '', due: '' });
  const [docBusyId, setDocBusyId] = useState('');
  const [docNote, setDocNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => coverFromRecord(contract));
  const [saveNote, setSaveNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [askPurge, setAskPurge] = useState(false);
  const [brregHits, setBrregHits] = useState([]);
  const [brregSearching, setBrregSearching] = useState(false);
  const [open, setOpen] = useState({
    cover: true,
    kunde: true,
    dokumenter: true,
    milepeler: false,
    underavtaler: false,
  });
  const [previewId, setPreviewId] = useState('');
  const lookupRef = useRef('');
  const { isPhone } = useLayout();
  const splitPreview = !isPhone;

  const children = childAgreements(contracts, contract.id);
  const parent = contracts.find((row) => row.id === contract.parentId) || null;
  const parents = parentOptions(contracts, contract.id);
  const orgnrDigits = normalizeOrgnr(form.orgnr) || String(form.orgnr || '').replace(/\D/g, '').slice(0, 9);

  useEffect(() => {
    if (!editing) setForm(coverFromRecord(contract));
  }, [contract, editing]);

  useEffect(() => {
    const docs = contract?.documents || [];
    setPreviewId((current) => (docs.some((doc) => doc.id === current) ? current : (docs[0]?.id || '')));
  }, [contract]);

  useEffect(() => {
    if (!editing) {
      setBrregHits([]);
      return undefined;
    }
    const q = orgnrDigits.length === 9 ? orgnrDigits : String(form.buyer || '').trim();
    if (q.length < 2) {
      setBrregHits([]);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(async () => {
      setBrregSearching(true);
      try {
        const res = await searchBrregCompanies(q, { size: 8 });
        if (!live) return;
        setBrregHits(res.results || []);
        const exact = (res.results || []).find((row) => row.organisasjonsnummer === orgnrDigits);
        if (exact && lookupRef.current !== orgnrDigits) {
          lookupRef.current = orgnrDigits;
          const draft = customerDraftFromBrreg(exact);
          if (draft) {
            setForm((current) => ({
              ...current,
              orgnr: draft.orgnr || current.orgnr,
              buyer: current.buyer || draft.name,
              address: current.address || draft.address,
              place: current.place || draft.place,
              personnummer: '',
            }));
          }
        }
      } catch {
        if (live) setBrregHits([]);
      } finally {
        if (live) setBrregSearching(false);
      }
    }, 280);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [editing, form.buyer, orgnrDigits]);

  const indexChoices = useMemo(() => {
    const selected = form.indexId;
    return INDEX_SERIES.filter((row) => (
      ['ppi-byggeteknisk', 'bki-boligblokk', 'kpi', 'bki-bustader', 'bki-veg'].includes(row.id)
      || row.id === selected
    ));
  }, [form.indexId]);

  async function apply(change) {
    const loaded = await loadAnbudState(companyId);
    const result = change(loaded);
    await onCommit(result);
    return result;
  }

  function patch(part) {
    setForm((current) => ({ ...current, ...part }));
    setSaveNote('');
  }

  function applyBrregHit(hit) {
    const draft = customerDraftFromBrreg(hit);
    if (!draft) return;
    lookupRef.current = draft.orgnr || '';
    patch({
      orgnr: draft.orgnr,
      buyer: draft.name || form.buyer,
      address: draft.address || form.address,
      place: draft.place || form.place,
      personnummer: '',
    });
    setBrregHits([]);
  }

  function coverFields(source) {
    return {
      ...(contract.fields || {}),
      honorar: '',
      place: source.place,
      postalCode: source.postalCode,
      address: source.address,
      gnrBnr: source.gnrBnr,
      engagementPercent: source.engagementPercent,
      description: source.description,
      poNumber: source.poNumber,
      orgnr: source.orgnr,
      supplierOrgnr: source.supplierOrgnr,
      personnummer: source.personnummer,
      contactName: source.contactName,
      phone: source.phone,
      email: source.email,
      buyerAddress: source.buyerAddress,
      invoiceMethod: source.invoiceMethod,
      invoiceAttn: source.invoiceAttn,
      leaderUid: source.leaderUid,
      leaderName: source.leaderName,
      leaderEmail: source.leaderEmail,
      leaderPhone: source.leaderPhone,
      resourceName: source.assignees?.[0]?.name || source.resourceName,
      resourceEmail: source.assignees?.[0]?.email || source.resourceEmail,
      resourcePhone: source.assignees?.[0]?.phone || source.resourcePhone,
      assignees: source.assignees || [],
      honorarForm: source.honorarForm,
      biomkostninger: source.biomkostninger,
      paymentTerms: source.paymentTerms,
      specialTerms: source.specialTerms,
      indexBase: source.indexBase,
      reference: source.oppdragId || source.reference,
      standard: source.standard,
      indexId: source.indexId,
      surchargePercent: source.surchargePercent,
      contractDate: source.contractDate,
      projectName: source.projectName || source.title,
    };
  }

  function detailInput(source, extra = {}) {
    return {
      title: source.title,
      buyer: source.buyer,
      supplier: source.supplier,
      projectName: source.projectName || source.title,
      description: source.description,
      address: source.address,
      kind: source.kind,
      parentId: source.parentId,
      customerId: source.customerId || '',
      projectId: source.projectId || '',
      value: source.value,
      start: source.start,
      end: source.end,
      systemId: source.systemId,
      oppdragId: source.oppdragId,
      ownerUid: source.ownerUid || '',
      ownerName: source.ownerName || '',
      fields: coverFields(source),
      renewal: {
        type: source.renewalType || 'ingen',
        until: source.renewalUntil,
        noticeDays: source.renewalNoticeDays,
      },
      ...extra,
    };
  }

  async function persistDetails(input, { syncOwner = false, person = null } = {}) {
    const result = await apply((loaded) => {
      const updated = updateContractDetails(loaded, contract.id, input);
      if (!updated.ok || !syncOwner) return updated;
      const row = (updated.state.contracts || []).find((item) => item.id === contract.id);
      if (!row?.customerId) return updated;
      const owned = setCustomerOwner(updated.state, row.customerId, person);
      return owned.ok ? owned : updated;
    });
    if (!result?.ok) setSaveNote(result?.error || 'Kunne ikke lagre.');
    else setSaveNote('Endringene er lagret.');
    return result;
  }

  function customerPatch(row) {
    if (!row) return { customerId: '' };
    return {
      customerId: row.id,
      buyer: row.name || form.buyer,
      orgnr: row.orgnr || form.orgnr,
      personnummer: row.kind === 'person' ? (row.personnummer || '') : '',
      contactName: form.contactName || row.contactName || '',
      email: form.email || row.email || '',
      phone: form.phone || row.phone || '',
      address: form.address || row.address || '',
      place: form.place || row.place || '',
      postalCode: form.postalCode || row.postalCode || '',
      buyerAddress: form.buyerAddress || row.address || '',
    };
  }

  function selectCustomer(row) {
    const part = customerPatch(row);
    if (editing) {
      patch(part);
      return;
    }
    if (!row) {
      persistDetails({ customerId: '' });
      return;
    }
    persistDetails({
      customerId: row.id,
      buyer: row.name || contract.buyer,
      address: contract.address || row.address || '',
      fields: {
        ...(contract.fields || {}),
        orgnr: row.orgnr || contract.fields?.orgnr || '',
        personnummer: row.kind === 'person' ? (row.personnummer || '') : (contract.fields?.personnummer || ''),
        contactName: contract.fields?.contactName || row.contactName || '',
        email: contract.fields?.email || row.email || '',
        phone: contract.fields?.phone || row.phone || '',
        place: contract.fields?.place || row.place || '',
        postalCode: contract.fields?.postalCode || row.postalCode || '',
        buyerAddress: contract.fields?.buyerAddress || row.address || '',
      },
    });
  }

  function selectProject(project) {
    const part = project
      ? { projectId: project.id, projectName: project.name || form.projectName || contract.projectName || '' }
      : { projectId: '' };
    if (editing) {
      patch(part);
      return;
    }
    persistDetails(part);
  }

  function selectOwner(person) {
    const part = {
      ownerUid: person ? (person.uid || person.id || '') : '',
      ownerName: person?.name || '',
    };
    if (editing) {
      patch(part);
      return;
    }
    persistDetails(part, { syncOwner: true, person: part.ownerUid ? person : null });
  }

  async function saveEdits() {
    if (saving) return;
    setSaving(true);
    setSaveNote('');
    try {
      const person = form.ownerUid
        ? (people.find((row) => (row.uid || row.id) === form.ownerUid) || { uid: form.ownerUid, name: form.ownerName })
        : null;
      const result = await persistDetails(detailInput(form), { syncOwner: true, person });
      if (!result?.ok) return;
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function attachOriginal(doc) {
    if (!companyId || !doc?.id || docBusyId) return;
    setDocNote('');
    const picked = await pickDocument({ accept: DOC_ACCEPT });
    if (!picked) return;
    setDocBusyId(doc.id);
    try {
      const uploaded = await uploadAgreementFile(companyId, picked, { salt: `${doc.id}-${Date.now()}` });
      const result = await apply((loaded) => attachContractDocumentFile(loaded, contract.id, doc.id, uploaded));
      if (!result?.ok) {
        setDocNote(result?.error || 'Kunne ikke knytte originalfilen.');
        return;
      }
      setDocNote('Originalfilen er lagret. Åpne dokumentet for å se PDF-en.');
    } catch (cause) {
      setDocNote(cause?.message || 'Kunne ikke laste opp originalfilen.');
    } finally {
      setDocBusyId('');
    }
  }

  async function addDocuments() {
    if (!companyId || docBusyId) return;
    setDocNote('');
    const picked = await pickDocument({ accept: DOC_ACCEPT, multiple: true });
    const list = (Array.isArray(picked) ? picked : (picked ? [picked] : [])).filter(Boolean);
    if (!list.length) return;
    setDocBusyId('new');
    try {
      const uploaded = [];
      for (let index = 0; index < list.length; index += 1) {
        setDocNote(list.length > 1 ? `Laster opp ${index + 1}/${list.length}…` : 'Laster opp…');
        uploaded.push(await uploadAgreementFile(companyId, list[index], { salt: `${Date.now()}-${index}` }));
      }
      const result = await apply((loaded) => addContractDocuments(loaded, contract.id, uploaded));
      if (!result?.ok) {
        setDocNote(result?.error || 'Kunne ikke legge til dokumentene.');
        return;
      }
      setDocNote(list.length > 1
        ? `${list.length} dokumenter er lagret som PDF.`
        : 'Dokumentet er lagret. Åpne det for å se PDF-en.');
    } catch (cause) {
      setDocNote(cause?.message || 'Kunne ikke laste opp dokumentene.');
    } finally {
      setDocBusyId('');
    }
  }

  async function removeAgreement() {
    setAskDelete(false);
    const result = await apply((loaded) => deleteContract(loaded, contract.id));
    if (result?.ok) onDeleted?.();
  }

  async function reviveAgreement() {
    const result = await apply((loaded) => restoreContract(loaded, contract.id));
    if (result?.ok) setSaveNote('Avtalen er gjenopprettet fra papirkurven.');
  }

  async function destroyAgreement() {
    setAskPurge(false);
    const result = await apply((loaded) => purgeContract(loaded, contract.id));
    if (result?.ok) onPurged?.();
  }

  function toggle(id) {
    setOpen((current) => ({ ...current, [id]: !current[id] }));
  }

  const period = [contract.start, contract.end].filter(Boolean).join(' – ');
  const honorar = contract.value != null && contract.value !== '' ? formatNok(contract.value) : '';
  const closed = contract.status === 'avsluttet';
  const trashed = !!contract.deletedAt;
  const statusLabel = contractStatusLabel(contract);
  const statusMuted = trashed || closed || statusLabel === 'Utløpt';

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Til oversikten</Text>
        </TouchableOpacity>
        <View style={styles.row}>
          {trashed ? (
            <TouchableOpacity
              onPress={reviveAgreement}
              accessibilityRole="button"
              style={[styles.btn, { borderColor: colors.brand, backgroundColor: colors.brandSoft || colors.bg }]}
            >
              <Text style={{ color: colors.brand, fontWeight: '600' }}>Gjenopprett</Text>
            </TouchableOpacity>
          ) : null}
          {trashed && canPurge ? (
            <TouchableOpacity
              onPress={() => setAskPurge(true)}
              accessibilityRole="button"
              style={[styles.btn, { borderColor: colors.danger || '#b42318' }]}
            >
              <Text style={{ color: colors.danger || '#b42318', fontWeight: '600' }}>Slett helt</Text>
            </TouchableOpacity>
          ) : null}
          {!closed && !trashed ? (
            <TouchableOpacity
              onPress={() => {
                if (editing) {
                  setEditing(false);
                  setForm(coverFromRecord(contract));
                  setSaveNote('');
                } else {
                  setEditing(true);
                  setForm({
                    ...coverFromRecord(contract),
                    ownerUid: contract.ownerUid || customer?.ownerUid || '',
                    ownerName: contract.ownerName || customer?.ownerName || '',
                  });
                }
              }}
              accessibilityRole="button"
              style={[styles.btn, { borderColor: colors.brand, backgroundColor: editing ? colors.bg : (colors.brandSoft || colors.bg) }]}
            >
              <Text style={{ color: colors.brand, fontWeight: '600' }}>{editing ? 'Avbryt redigering' : 'Rediger'}</Text>
            </TouchableOpacity>
          ) : null}
          {!trashed ? (
            <TouchableOpacity
              onPress={() => setAskDelete(true)}
              accessibilityRole="button"
              style={[styles.btn, { borderColor: colors.danger || '#b42318' }]}
            >
              <Text style={{ color: colors.danger || '#b42318', fontWeight: '600' }}>Slett</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {!!saveNote && <Text style={{ color: colors.brand }}>{saveNote}</Text>}

      <View
        nativeID={splitPreview ? 'agreement-detail-split' : 'agreement-detail-stack'}
        style={splitPreview ? styles.split : styles.stack}
      >
      <View style={splitPreview ? styles.splitLeft : styles.stackPane}>
      <View style={[styles.hero, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <View style={styles.heroTop}>
          <Text style={styles.kicker}>{kindLabel(contract.kind) || 'Avtale'}</Text>
          <View style={[styles.badge, { backgroundColor: statusMuted ? (colors.sunken || colors.bg) : (colors.brandSoft || colors.bg) }]}>
            <Text style={{ color: statusMuted ? colors.muted : colors.brand, fontWeight: '700', fontSize: 12 }}>
              {statusLabel}
            </Text>
          </View>
        </View>
        <Text style={[styles.h, { color: colors.ink }]}>{contract.title}</Text>
        <Text style={{ color: colors.muted }}>
          {[contract.buyer, period, honorar ? `${honorar} eks. mva` : '', formatNumberId(contract.oppdragId)].filter(Boolean).join(' · ') || 'Opplysningene står under.'}
        </Text>
      </View>

      <Section colors={colors} title="Avtaleopplysninger" open={open.cover} onToggle={() => toggle('cover')}>
        {editing ? (
          <View style={{ gap: 14 }}>
            <View style={styles.grid}>
              <View style={[styles.fact, styles.factWide]}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Avtaletype</Text>
                <View style={styles.row}>
                  {AGREEMENT_KINDS.map((row) => (
                    <TouchableOpacity
                      key={row.id}
                      onPress={() => patch({ kind: row.id })}
                      accessibilityRole="button"
                      style={[styles.chip, form.kind === row.id && { borderColor: colors.brand, backgroundColor: colors.brandSoft || colors.bg }]}
                    >
                      <Text style={{ color: form.kind === row.id ? colors.brand : colors.ink }}>{row.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <EditField colors={colors} label="Oppdrag" value={form.title} onChange={(title) => patch({ title })} />
              <EditField colors={colors} label="Oppdrags-ID" value={form.oppdragId} onChange={(oppdragId) => patch({ oppdragId })} />
              <EditField colors={colors} label="System-ID" value={form.systemId} onChange={(systemId) => patch({ systemId })} hint="Valgfritt. Vises ikke i listen." />
              <EditField colors={colors} label="Beskrivelse av oppdraget" value={form.description} onChange={(description) => patch({ description })} multiline />
              <EditField colors={colors} label="Eksternt PO-nummer" value={form.poNumber} onChange={(poNumber) => patch({ poNumber })} />
              <EditField colors={colors} label="Generelle bestemmelser" value={form.standard} onChange={(standard) => patch({ standard })} placeholder="NS 8403" />
            </View>

            <Text style={styles.groupTitle}>Oppdragssted og periode</Text>
            <View style={styles.grid}>
              <EditField colors={colors} label="Adresse" value={form.address} onChange={(address) => patch({ address })} />
              <EditField colors={colors} label="Postnummer" value={form.postalCode} onChange={(postalCode) => patch({ postalCode })} keyboardType="number-pad" />
              <EditField colors={colors} label="Sted" value={form.place} onChange={(place) => patch({ place })} />
              <EditField colors={colors} label="Gnr / Bnr" value={form.gnrBnr} onChange={(gnrBnr) => patch({ gnrBnr })} />
              <EditField colors={colors} label="Engasjement behov (%)" value={form.engagementPercent} onChange={(engagementPercent) => patch({ engagementPercent })} keyboardType="decimal-pad" />
              <DateEdit colors={colors} label="Oppstart" value={form.start} onChange={(start) => patch({ start })} />
              <DateEdit colors={colors} label="Sluttdato" value={form.end} onChange={(end) => patch({ end })} />
              <DateEdit colors={colors} label="Avtaledato" value={form.contractDate} onChange={(contractDate) => patch({ contractDate })} />
            </View>

            <Text style={styles.groupTitle}>Oppdragsgiver</Text>
            <AgreementCustomerField
              colors={colors}
              customers={customers}
              customerId={form.customerId}
              companyId={companyId}
              people={people}
              label="Kundeforhold"
              onSelect={selectCustomer}
              onSavedState={onCustomersChanged}
            />
            <View style={styles.grid}>
              <EditField colors={colors} label="Oppdragsgiver" value={form.buyer} onChange={(buyer) => patch({ buyer })} hint="Søk i Enhetsregisteret med navn eller org.nr." />
              <EditField
                colors={colors}
                label="Organisasjonsnummer"
                value={form.orgnr}
                onChange={(orgnr) => patch({ orgnr })}
                keyboardType="number-pad"
                placeholder="Ni siffer"
              />
              <EditField colors={colors} label="Kontaktperson" value={form.contactName} onChange={(contactName) => patch({ contactName })} />
              <EditField colors={colors} label="E-post" value={form.email} onChange={(email) => patch({ email })} keyboardType="email-address" />
              <EditField colors={colors} label="Telefon" value={form.phone} onChange={(phone) => patch({ phone })} keyboardType="phone-pad" />
              <EditField colors={colors} label="Adresse (oppdragsgiver)" value={form.buyerAddress} onChange={(buyerAddress) => patch({ buyerAddress })} />
              <View style={[styles.fact, styles.factWide]}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Faktura mottak</Text>
                <View style={styles.row}>
                  {INVOICE_METHODS.map((row) => (
                    <TouchableOpacity key={row.id} onPress={() => patch({ invoiceMethod: row.id })} accessibilityRole="button">
                      <Text style={{ color: form.invoiceMethod === row.id ? colors.brand : colors.ink }}>{row.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <EditField colors={colors} label="Faktura stiles til" value={form.invoiceAttn} onChange={(invoiceAttn) => patch({ invoiceAttn })} />
            </View>
            {brregSearching ? <Text style={{ color: colors.muted }}>Søker i Enhetsregisteret…</Text> : null}
            {brregHits.length ? (
              <View style={[styles.brregBox, { borderColor: colors.line, backgroundColor: colors.bg }]}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Treff i Brønnøysund</Text>
                {brregHits.map((hit) => (
                  <TouchableOpacity key={hit.organisasjonsnummer} onPress={() => applyBrregHit(hit)} accessibilityRole="button">
                    <Text style={{ color: colors.brand }}>
                      {hit.navn} · {formatOrgnr(hit.organisasjonsnummer)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <Text style={styles.groupTitle}>Oppdragstaker</Text>
            <View style={styles.grid}>
              <EditField colors={colors} label="Oppdragstaker" value={form.supplier} onChange={(supplier) => patch({ supplier })} />
              <EditField
                colors={colors}
                label="Organisasjonsnummer"
                value={form.supplierOrgnr}
                onChange={(supplierOrgnr) => patch({ supplierOrgnr })}
                keyboardType="number-pad"
              />
              <AgreementPersonField
                colors={colors}
                people={people}
                ownerUid={form.leaderUid}
                label="Oppdragsleder"
                onSelect={(person) => patch({
                  leaderUid: person ? (person.uid || person.id || '') : '',
                  leaderName: person?.name || '',
                })}
              />
              <EditField colors={colors} label="Oppdragsleder e-post" value={form.leaderEmail} onChange={(leaderEmail) => patch({ leaderEmail })} keyboardType="email-address" />
              <EditField colors={colors} label="Oppdragsleder telefon" value={form.leaderPhone} onChange={(leaderPhone) => patch({ leaderPhone })} keyboardType="phone-pad" />
              <AgreementAssigneesField
                colors={colors}
                employees={employees}
                assignees={form.assignees || []}
                onChange={(assignees) => patch({
                  assignees,
                  resourceName: assignees[0]?.name || '',
                  resourceEmail: assignees[0]?.email || '',
                  resourcePhone: assignees[0]?.phone || '',
                })}
              />
            </View>

            <Text style={styles.groupTitle}>Honorar og regulering</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Beløp føres som rene tall, eks. mva.</Text>
            <View style={styles.grid}>
              <EditField
                colors={colors}
                label="Avtalt honorar (eks. mva)"
                value={form.value}
                onChange={(value) => patch({ value })}
                keyboardType="decimal-pad"
                placeholder="0"
              />
              <EditField colors={colors} label="Honoreringsform" value={form.honorarForm} onChange={(honorarForm) => patch({ honorarForm })} />
              <EditField
                colors={colors}
                label="Påslagsprosent"
                value={form.surchargePercent}
                onChange={(surchargePercent) => patch({ surchargePercent })}
                keyboardType="decimal-pad"
              />
              <EditField colors={colors} label="Biomkostninger" value={form.biomkostninger} onChange={(biomkostninger) => patch({ biomkostninger })} multiline />
              <EditField colors={colors} label="Betalingsbetingelser" value={form.paymentTerms} onChange={(paymentTerms) => patch({ paymentTerms })} />
              <EditField colors={colors} label="Særlige bestemmelser" value={form.specialTerms} onChange={(specialTerms) => patch({ specialTerms })} multiline />
              <View style={[styles.fact, styles.factWide]}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Prisregulering / indeks</Text>
                <View style={styles.row}>
                  <TouchableOpacity onPress={() => patch({ indexId: '' })} accessibilityRole="button">
                    <Text style={{ color: form.indexId ? colors.muted : colors.brand }}>Ingen</Text>
                  </TouchableOpacity>
                  {indexChoices.map((row) => (
                    <TouchableOpacity key={row.id} onPress={() => patch({ indexId: row.id })} accessibilityRole="button">
                      <Text style={{ color: form.indexId === row.id ? colors.brand : colors.ink }}>{row.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <Text style={styles.groupTitle}>Varighet og fornyelse</Text>
            <View style={styles.row}>
              {RENEWAL_TYPES.map((row) => (
                <TouchableOpacity key={row.id} onPress={() => patch({ renewalType: row.id })} accessibilityRole="button">
                  <Text style={{ color: form.renewalType === row.id ? colors.brand : colors.ink }}>{row.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.grid}>
              <DateEdit colors={colors} label="Fornyes til" value={form.renewalUntil} onChange={(renewalUntil) => patch({ renewalUntil })} />
              <EditField
                colors={colors}
                label="Varsel før utløp (dager)"
                value={form.renewalNoticeDays}
                onChange={(renewalNoticeDays) => patch({ renewalNoticeDays })}
                keyboardType="number-pad"
              />
            </View>

            {parents.length ? (
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Tilknyttet avtale</Text>
                <View style={styles.row}>
                  <TouchableOpacity onPress={() => patch({ parentId: '' })} accessibilityRole="button">
                    <Text style={{ color: form.parentId ? colors.muted : colors.brand }}>Ingen</Text>
                  </TouchableOpacity>
                  {parents.map((row) => (
                    <TouchableOpacity key={row.id} onPress={() => patch({ parentId: row.id })} accessibilityRole="button">
                      <Text style={{ color: form.parentId === row.id ? colors.brand : colors.ink }}>{row.title}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            <AgreementProjectField
              colors={colors}
              projects={projects}
              projectId={form.projectId}
              onSelect={selectProject}
            />
            <AgreementPersonField
              colors={colors}
              people={people}
              ownerUid={form.ownerUid}
              ownerName={form.ownerName}
              label="Ansvarlig for avtalen"
              onSelect={selectOwner}
            />

            <TouchableOpacity
              onPress={saveEdits}
              disabled={saving}
              accessibilityRole="button"
              style={[styles.save, { backgroundColor: colors.brand, opacity: saving ? 0.6 : 1 }]}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>{saving ? 'Lagrer…' : 'Lagre endringer'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            <FieldGroup
              colors={colors}
              title="Avtalen"
              rows={[
                { label: 'Avtaletype', value: kindLabel(contract.kind) },
                { label: 'Oppdrags-ID', value: formatNumberId(contract.oppdragId) },
                { label: 'System-ID', value: formatNumberId(contract.systemId) },
                { label: 'Oppdrag', value: contract.title },
                { label: 'Beskrivelse', value: contract.description || contract.fields?.description },
                { label: 'Eksternt PO-nummer', value: contract.fields?.poNumber },
                { label: 'Generelle bestemmelser', value: contract.fields?.standard },
                { label: 'Tilknyttet avtale', value: parent?.title },
                { label: 'Ansvarlig', value: contract.ownerName || customer?.ownerName },
                { label: 'Prosjekt', value: contract.projectId ? (contract.projectName || 'Koblet') : '' },
              ]}
            />
            <FieldGroup
              colors={colors}
              title="Oppdragssted og periode"
              rows={[
                { label: 'Adresse', value: contract.address || contract.fields?.address },
                { label: 'Postnummer', value: contract.fields?.postalCode },
                { label: 'Sted', value: contract.fields?.place },
                { label: 'Gnr / Bnr', value: contract.fields?.gnrBnr },
                { label: 'Engasjement behov (%)', value: contract.fields?.engagementPercent },
                { label: 'Oppstart', value: contract.start },
                { label: 'Sluttdato', value: contract.end },
                { label: 'Avtaledato', value: contract.fields?.contractDate },
              ]}
            />
            <FieldGroup
              colors={colors}
              title="Oppdragsgiver"
              rows={[
                { label: 'Oppdragsgiver', value: contract.buyer },
                { label: 'Organisasjonsnummer', value: formatOrgnr(contract.fields?.orgnr) },
                { label: 'Personnummer', value: contract.fields?.personnummer ? maskPersonnummer(contract.fields.personnummer) : '' },
                { label: 'Kontaktperson', value: contract.fields?.contactName },
                { label: 'E-post', value: contract.fields?.email },
                { label: 'Telefon', value: contract.fields?.phone },
                { label: 'Adresse (oppdragsgiver)', value: contract.fields?.buyerAddress },
                { label: 'Faktura mottak', value: invoiceLabel(contract.fields?.invoiceMethod) },
                { label: 'Faktura stiles til', value: contract.fields?.invoiceAttn },
              ]}
            />
            <FieldGroup
              colors={colors}
              title="Oppdragstaker"
              rows={[
                { label: 'Oppdragstaker', value: contract.supplier },
                { label: 'Organisasjonsnummer', value: formatOrgnr(contract.fields?.supplierOrgnr) },
                { label: 'Oppdragsleder', value: contract.fields?.leaderName },
                { label: 'Oppdragsleder e-post', value: contract.fields?.leaderEmail },
                { label: 'Oppdragsleder telefon', value: contract.fields?.leaderPhone },
                { label: 'Oppfølging', value: (contract.fields?.assignees || []).map((row) => row.name).filter(Boolean).join(', ') || contract.fields?.resourceName },
              ]}
            />
            <FieldGroup
              colors={colors}
              title="Honorar og regulering"
              rows={[
                { label: 'Honoreringsform', value: contract.fields?.honorarForm },
                { label: 'Avtalt honorar (eks. mva)', value: honorar },
                { label: 'Påslagsprosent', value: contract.fields?.surchargePercent },
                { label: 'Biomkostninger', value: contract.fields?.biomkostninger },
                { label: 'Prisregulering / indeks', value: indexLabel(contract.fields?.indexId) },
                { label: 'Betalingsbetingelser', value: contract.fields?.paymentTerms },
                { label: 'Særlige bestemmelser', value: contract.fields?.specialTerms },
              ]}
            />
            <FieldGroup
              colors={colors}
              title="Varighet og fornyelse"
              rows={[
                { label: 'Fornyelse', value: contract.renewal?.type && contract.renewal.type !== 'ingen' ? RENEWAL_TYPES.find((row) => row.id === contract.renewal.type)?.label : '' },
                { label: 'Fornyes til', value: contract.renewal?.until },
                { label: 'Varsel før utløp', value: Number(contract.renewal?.noticeDays) > 0 ? `${contract.renewal.noticeDays} dager` : '' },
              ]}
            />
          </View>
        )}
      </Section>

      <Section colors={colors} title="Kunde, prosjekt og ansvarlig" open={open.kunde} onToggle={() => toggle('kunde')}>
        {editing ? (
          <Text style={{ color: colors.muted }}>
            Kundeforhold, prosjekt og ansvarlig endres i avtaleopplysningene over, og lagres med «Lagre endringer».
          </Text>
        ) : (
          <View style={{ gap: 12 }}>
            <AgreementCustomerField
              colors={colors}
              customers={customers}
              customerId={contract.customerId}
              companyId={companyId}
              people={people}
              label="Kundeforhold"
              onSelect={selectCustomer}
              onSavedState={onCustomersChanged}
            />
            {customer ? (
              <TouchableOpacity onPress={() => onOpenCustomer?.(customer.id)} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Åpne kundeforholdet</Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ color: colors.muted }}>Ingen kunde er koblet ennå. Søk i kunderegisteret eller Brønnøysund.</Text>
            )}
            <AgreementProjectField
              colors={colors}
              projects={projects}
              projectId={contract.projectId}
              onSelect={selectProject}
            />
            <AgreementPersonField
              colors={colors}
              people={people}
              ownerUid={contract.ownerUid || customer?.ownerUid || ''}
              ownerName={contract.ownerName || customer?.ownerName || ''}
              label="Ansvarlig for avtalen"
              onSelect={selectOwner}
            />
          </View>
        )}
      </Section>

      {(contract.options || []).length ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 16 }}>Opsjoner</Text>
          {contract.options.map((row) => (
            <TouchableOpacity
              key={row.id}
              onPress={() => apply((loaded) => exerciseOption(loaded, contract.id, row.id, !row.exercised))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: row.exercised }}
            >
              <Text style={{ color: row.exercised ? colors.success : colors.ink }}>
                {row.exercised ? '✓' : '○'} {row.title}{[row.start, row.end].filter(Boolean).length ? ` · ${[row.start, row.end].filter(Boolean).join(' – ')}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <Section colors={colors} title="Underavtaler" open={open.underavtaler} onToggle={() => toggle('underavtaler')}>
        {parent ? (
          <TouchableOpacity onPress={() => onOpenAgreement?.(parent.id)} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Hovedavtale: {parent.title}</Text>
          </TouchableOpacity>
        ) : null}
        {children.map((row) => (
          <TouchableOpacity key={row.id} onPress={() => onOpenAgreement?.(row.id)} accessibilityRole="button">
            <Text style={{ color: colors.ink }}>{kindLabel(row.kind) || 'Avtale'} · {row.title}</Text>
          </TouchableOpacity>
        ))}
        {!children.length && !parent ? <Text style={{ color: colors.muted }}>Ingen avrop eller endringer er knyttet hit ennå.</Text> : null}
        {contract.kind === 'rammeavtale' || contract.kind === 'oppdrag' ? (
          <View style={styles.row}>
            <TouchableOpacity onPress={() => onNewChild?.('avrop')} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Nytt avrop</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onNewChild?.('endring')} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Ny endring</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </Section>

      <Section colors={colors} title="Milepæler og leveranser" open={open.milepeler} onToggle={() => toggle('milepeler')}>
        {(contract.milestones || []).map((row) => (
          <View key={row.id} style={{ gap: 4 }}>
            <TouchableOpacity
              onPress={() => apply((loaded) => setMilestoneStatus(loaded, contract.id, row.id, row.status === 'utfort' ? 'planlagt' : 'utfort'))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: row.status === 'utfort' }}
            >
              <Text style={{ color: row.status === 'utfort' ? colors.success : colors.ink }}>
                {row.status === 'utfort' ? '✓' : '○'} {row.title}{row.due ? ` · ${row.due}` : ''}
              </Text>
            </TouchableOpacity>
            {!row.due ? (
              <View style={[styles.dateBox, { borderColor: colors.line, backgroundColor: colors.bg, maxWidth: 220 }]}>
                <DateField
                  value={dates[row.id] || null}
                  onChange={(date) => {
                    const due = isoFromDate(date);
                    setDates((current) => ({ ...current, [row.id]: due }));
                    if (due) apply((loaded) => setMilestoneDue(loaded, contract.id, row.id, due));
                  }}
                  placeholder="Velg dato"
                  iconColor={colors.brand}
                  style={styles.dateField}
                  textStyle={{ color: dates[row.id] ? colors.ink : colors.placeholder }}
                />
              </View>
            ) : null}
          </View>
        ))}
        <Text style={{ color: colors.ink, fontWeight: '600' }}>Leveranser</Text>
        {(contract.deliveries || []).map((row) => (
          <TouchableOpacity
            key={row.id}
            onPress={() => apply((loaded) => setDeliveryStatus(loaded, contract.id, row.id, row.status === 'levert' ? 'avtalt' : 'levert'))}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: row.status === 'levert' }}
          >
            <Text style={{ color: row.status === 'levert' ? colors.success : colors.ink }}>
              {row.status === 'levert' ? '✓' : '○'} {row.title}{row.due ? ` · ${row.due}` : ''}
            </Text>
          </TouchableOpacity>
        ))}
        <TextInput
          value={delivery.title}
          onChangeText={(title) => setDelivery((current) => ({ ...current, title }))}
          placeholder="Ny leveranse"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        <View style={[styles.dateBox, { borderColor: colors.line, backgroundColor: colors.bg, maxWidth: 220 }]}>
          <DateField
            value={delivery.due || null}
            onChange={(date) => setDelivery((current) => ({ ...current, due: isoFromDate(date) }))}
            placeholder="Frist"
            iconColor={colors.brand}
            style={styles.dateField}
            textStyle={{ color: delivery.due ? colors.ink : colors.placeholder }}
          />
        </View>
        <TouchableOpacity
          onPress={async () => {
            const result = await apply((loaded) => addDelivery(loaded, contract.id, delivery));
            if (result?.ok) setDelivery({ title: '', due: '' });
          }}
          accessibilityRole="button"
          style={[styles.save, { backgroundColor: colors.brand }]}
        >
          <Text style={{ color: '#fff' }}>Legg til leveranse</Text>
        </TouchableOpacity>
      </Section>

      <View style={styles.row}>
        <TouchableOpacity onPress={onOpenProject} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>{contract.projectId ? 'Prosjektet er koblet' : 'Opprett prosjekt'}</Text>
        </TouchableOpacity>
        {contract.indexDraft ? (
          <TouchableOpacity onPress={onOpenIndex} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Åpne i indeksarbeid</Text>
          </TouchableOpacity>
        ) : null}
        {!closed && !trashed ? (
          <TouchableOpacity onPress={() => apply((loaded) => closeContract(loaded, contract.id))} accessibilityRole="button">
            <Text style={{ color: colors.muted }}>Avslutt avtale</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      </View>

      <View style={splitPreview ? styles.splitRight : styles.stackPane}>
        <AgreementDocumentPreview
          colors={colors}
          documents={contract.documents || []}
          selectedId={previewId}
          onSelect={setPreviewId}
          minHeight={splitPreview ? 560 : 360}
        />
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 16 }}>
            {`Dokumenter (${(contract.documents || []).length})`}
          </Text>
          <View style={{ gap: 8 }}>
            {(contract.documents || []).length ? (contract.documents || []).map((doc) => {
              const selected = (previewId || contract.documents?.[0]?.id) === doc.id;
              return (
                <View key={doc.id} style={[styles.docRow, { borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? (colors.brandSoft || colors.bg) : colors.bg }]}>
                  <TouchableOpacity
                    onPress={() => setPreviewId(doc.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={{ flex: 1 }}
                  >
                    <Text style={{ color: colors.ink, fontWeight: selected ? '700' : '400' }}>
                      {doc.name || 'Dokument'}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {documentHasOriginalFile(doc) ? 'Originalfil' : 'Mangler originalfil'}
                    </Text>
                  </TouchableOpacity>
                  {documentIsOpenable(doc) ? (
                    <TouchableOpacity onPress={() => openAgreementDocument(doc)} accessibilityRole="button">
                      <Text style={{ color: colors.brand }}>Åpne</Text>
                    </TouchableOpacity>
                  ) : null}
                  {!documentHasOriginalFile(doc) ? (
                    <TouchableOpacity onPress={() => attachOriginal(doc)} accessibilityRole="button" disabled={!!docBusyId}>
                      <Text style={{ color: colors.brand }}>
                        {docBusyId === doc.id ? 'Laster opp…' : 'Last opp'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            }) : <Text style={{ color: colors.muted }}>Ingen dokumenter er lagt ved.</Text>}
            <TouchableOpacity onPress={addDocuments} accessibilityRole="button" disabled={!!docBusyId}>
              <Text style={{ color: colors.brand }}>
                {docBusyId === 'new' ? 'Laster opp…' : 'Legg til dokumenter'}
              </Text>
            </TouchableOpacity>
            {docNote ? <Text style={{ color: colors.muted }}>{docNote}</Text> : null}
          </View>
        </View>
      </View>
      </View>

      <ConfirmDialog
        visible={askDelete}
        title="Flytt til papirkurv?"
        message={children.length
          ? `«${contract.title || 'Avtalen'}» og ${children.length} underavtale${children.length === 1 ? '' : 'r'} flyttes til papirkurven.`
          : `«${contract.title || 'Avtalen'}» flyttes til papirkurven.`}
        confirmText="Flytt"
        cancelText="Avbryt"
        danger
        onCancel={() => setAskDelete(false)}
        onConfirm={removeAgreement}
        onClose={() => setAskDelete(false)}
      />
      <ConfirmDialog
        visible={askPurge}
        title="Slett helt?"
        message={children.length
          ? `«${contract.title || 'Avtalen'}» og ${children.length} underavtale${children.length === 1 ? '' : 'r'} slettes for godt og kan ikke gjenopprettes.`
          : `«${contract.title || 'Avtalen'}» slettes for godt og kan ikke gjenopprettes.`}
        confirmText="Slett helt"
        cancelText="Avbryt"
        danger
        onCancel={() => setAskPurge(false)}
        onConfirm={destroyAgreement}
        onClose={() => setAskPurge(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  kicker: { color: '#64748b', fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: '700' },
  hero: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  split: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, width: '100%' },
  splitLeft: { flexGrow: 1, flexShrink: 1, flexBasis: '52%', minWidth: 300, gap: 12 },
  splitRight: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: '42%',
    minWidth: 340,
    maxWidth: 680,
    gap: 12,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' ? { position: 'sticky', top: 12 } : null),
  },
  stack: { gap: 14, width: '100%' },
  stackPane: { gap: 12, width: '100%' },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionBody: { gap: 10, paddingTop: 4 },
  save: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  topBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' },
  grid: { gap: 10 },
  fact: { width: '100%', gap: 4 },
  factWide: { width: '100%' },
  fieldGroup: { gap: 0 },
  factRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  factLabel: { width: 168, fontSize: 13, lineHeight: 18 },
  factValue: { flex: 1, fontSize: 15, lineHeight: 20 },
  docRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupTitle: { color: '#64748b', fontSize: 12, fontWeight: '700', letterSpacing: 0.35, textTransform: 'uppercase', marginTop: 4 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  btn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  chip: { borderWidth: 1, borderColor: 'transparent', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  dateBox: { borderWidth: 1, borderRadius: 10, justifyContent: 'center' },
  dateField: { paddingHorizontal: 10, paddingVertical: 8, minHeight: 42 },
  brregBox: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
});
