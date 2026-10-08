import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ConfirmDialog from '../../components/ConfirmDialog';
import DateField from '../../components/DateField';
import {
  addContractDocuments,
  addDelivery,
  attachContractDocumentFile,
  closeContract,
  deleteContract,
  exerciseOption,
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
} from '../../src/anbud/customers';
import { indexLabel } from '../../src/anbud/fieldReview';
import { formatNumberId } from '../../src/anbud/numbering';
import { documentHasOriginalFile, documentIsOpenable, openAgreementDocument } from '../../src/anbud/openDocument';
import { loadAnbudState } from '../../src/anbud/storage';
import { INDEX_SERIES } from '../../src/indeksregulering/catalog';
import { searchBrregCompanies } from '../../src/utils/boligmappaApis';
import { pickDocument } from '../../src/utils/media';
import { dateKey } from '../../src/utils/dates';
import OwnerPicker from './OwnerPicker';

const DOC_ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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

function Fact({ colors, label, value, wide = false }) {
  return (
    <View style={[styles.fact, wide && styles.factWide]}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: value ? colors.ink : colors.placeholder, fontSize: 15 }}>
        {value || '—'}
      </Text>
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
  people = [],
  colors,
  companyId,
  onCommit,
  onBack,
  onOpenProject,
  onOpenIndex,
  onOpenCustomer,
  onAssignOwner,
  onOpenAgreement,
  onNewChild,
  onDeleted,
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
  const [brregHits, setBrregHits] = useState([]);
  const [brregSearching, setBrregSearching] = useState(false);
  const [open, setOpen] = useState({
    cover: true,
    kunde: true,
    dokumenter: true,
    milepeler: false,
    underavtaler: false,
  });
  const lookupRef = useRef('');

  const children = childAgreements(contracts, contract.id);
  const parent = contracts.find((row) => row.id === contract.parentId) || null;
  const parents = parentOptions(contracts, contract.id);
  const orgnrDigits = normalizeOrgnr(form.orgnr) || String(form.orgnr || '').replace(/\D/g, '').slice(0, 9);

  useEffect(() => {
    if (!editing) setForm(coverFromRecord(contract));
  }, [contract, editing]);

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

  async function saveEdits() {
    if (saving) return;
    setSaving(true);
    setSaveNote('');
    try {
      const result = await apply((loaded) => updateContractDetails(loaded, contract.id, {
        title: form.title,
        buyer: form.buyer,
        supplier: form.supplier,
        projectName: form.projectName || form.title,
        description: form.description,
        address: form.address,
        kind: form.kind,
        parentId: form.parentId,
        customerId: form.customerId || contract.customerId,
        value: form.value,
        start: form.start,
        end: form.end,
        systemId: form.systemId,
        oppdragId: form.oppdragId,
        fields: {
          ...(contract.fields || {}),
          honorar: '',
          place: form.place,
          address: form.address,
          description: form.description,
          poNumber: form.poNumber,
          orgnr: form.orgnr,
          supplierOrgnr: form.supplierOrgnr,
          personnummer: form.personnummer,
          contactName: form.contactName,
          phone: form.phone,
          email: form.email,
          reference: form.oppdragId || form.reference,
          standard: form.standard,
          indexId: form.indexId,
          surchargePercent: form.surchargePercent,
          contractDate: form.contractDate,
          projectName: form.projectName || form.title,
        },
        renewal: {
          type: form.renewalType || 'ingen',
          until: form.renewalUntil,
          noticeDays: form.renewalNoticeDays,
        },
      }));
      if (!result?.ok) {
        setSaveNote(result?.error || 'Kunne ikke lagre.');
        return;
      }
      if (customer && form.ownerUid !== undefined && onAssignOwner) {
        const person = people.find((row) => (row.uid || row.id) === form.ownerUid) || null;
        if (form.ownerUid) await onAssignOwner(person || { uid: form.ownerUid, name: form.ownerName });
      }
      setEditing(false);
      setSaveNote('Endringene er lagret.');
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
                    ownerUid: customer?.ownerUid || '',
                    ownerName: customer?.ownerName || '',
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

      <View style={[styles.hero, { borderColor: colors.brand, backgroundColor: colors.card }]}>
        <View style={styles.heroTop}>
          <Text style={styles.kicker}>{kindLabel(contract.kind) || 'Avtale'}</Text>
          <View style={[styles.badge, { backgroundColor: statusMuted ? (colors.sunken || colors.bg) : (colors.brandSoft || colors.bg) }]}>
            <Text style={{ color: statusMuted ? colors.muted : colors.brand, fontWeight: '700', fontSize: 12 }}>
              {statusLabel}
            </Text>
          </View>
        </View>
        <Text style={[styles.h, { color: colors.ink }]}>{contract.title}</Text>
        <View style={styles.heroFacts}>
          <View style={styles.heroFact}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Kunde</Text>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{contract.buyer || '—'}</Text>
          </View>
          <View style={styles.heroFact}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Periode</Text>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{period || '—'}</Text>
          </View>
          <View style={styles.heroFact}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Avtalt honorar</Text>
            <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 18 }}>
              {honorar || '—'}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>eks. mva</Text>
          </View>
          <View style={styles.heroFact}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Oppdrags-ID</Text>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{formatNumberId(contract.oppdragId) || '—'}</Text>
          </View>
        </View>
        {contract.fields?.standard ? (
          <Text style={{ color: colors.muted }}>{contract.fields.standard}</Text>
        ) : null}
      </View>

      {!!saveNote && <Text style={{ color: colors.brand }}>{saveNote}</Text>}

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
              <EditField colors={colors} label="Sted" value={form.place} onChange={(place) => patch({ place })} />
              <DateEdit colors={colors} label="Oppstart" value={form.start} onChange={(start) => patch({ start })} />
              <DateEdit colors={colors} label="Sluttdato" value={form.end} onChange={(end) => patch({ end })} />
              <DateEdit colors={colors} label="Avtaledato" value={form.contractDate} onChange={(contractDate) => patch({ contractDate })} />
            </View>

            <Text style={styles.groupTitle}>Oppdragsgiver</Text>
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
              <EditField
                colors={colors}
                label="Påslagsprosent"
                value={form.surchargePercent}
                onChange={(surchargePercent) => patch({ surchargePercent })}
                keyboardType="decimal-pad"
              />
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

            <OwnerPicker
              colors={colors}
              people={people}
              value={form.ownerUid}
              label="Ansvarlig for avtalen"
              onChange={(person) => patch({
                ownerUid: person ? (person.uid || person.id) : '',
                ownerName: person ? person.name : '',
              })}
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
          <View style={{ gap: 14 }}>
            <View style={styles.grid}>
              <Fact colors={colors} label="Avtaletype" value={kindLabel(contract.kind)} />
              <Fact colors={colors} label="Oppdrags-ID" value={formatNumberId(contract.oppdragId)} />
              <Fact colors={colors} label="System-ID" value={formatNumberId(contract.systemId)} />
              <Fact colors={colors} label="Oppdrag" value={contract.title} wide />
              <Fact colors={colors} label="Beskrivelse" value={contract.description || contract.fields?.description} wide />
              <Fact colors={colors} label="Eksternt PO-nummer" value={contract.fields?.poNumber} />
              <Fact colors={colors} label="Generelle bestemmelser" value={contract.fields?.standard} />
              {parent ? <Fact colors={colors} label="Tilknyttet avtale" value={parent.title} wide /> : null}
            </View>

            <Text style={styles.groupTitle}>Oppdragssted og periode</Text>
            <View style={styles.grid}>
              <Fact colors={colors} label="Adresse" value={contract.address || contract.fields?.address} />
              <Fact colors={colors} label="Sted" value={contract.fields?.place} />
              <Fact colors={colors} label="Oppstart" value={contract.start} />
              <Fact colors={colors} label="Sluttdato" value={contract.end} />
              <Fact colors={colors} label="Avtaledato" value={contract.fields?.contractDate} />
            </View>

            <Text style={styles.groupTitle}>Oppdragsgiver</Text>
            <View style={styles.grid}>
              <Fact colors={colors} label="Oppdragsgiver" value={contract.buyer} />
              <Fact colors={colors} label="Organisasjonsnummer" value={formatOrgnr(contract.fields?.orgnr)} />
              {contract.fields?.personnummer ? (
                <Fact colors={colors} label="Personnummer" value={maskPersonnummer(contract.fields.personnummer)} />
              ) : null}
              <Fact colors={colors} label="Kontaktperson" value={contract.fields?.contactName} />
              <Fact colors={colors} label="E-post" value={contract.fields?.email} />
              <Fact colors={colors} label="Telefon" value={contract.fields?.phone} />
            </View>

            <Text style={styles.groupTitle}>Oppdragstaker</Text>
            <View style={styles.grid}>
              <Fact colors={colors} label="Oppdragstaker" value={contract.supplier} />
              <Fact colors={colors} label="Organisasjonsnummer" value={formatOrgnr(contract.fields?.supplierOrgnr)} />
            </View>

            <Text style={styles.groupTitle}>Honorar og regulering</Text>
            <View style={styles.grid}>
              <Fact colors={colors} label="Avtalt honorar (eks. mva)" value={honorar} />
              <Fact colors={colors} label="Påslagsprosent" value={contract.fields?.surchargePercent} />
              <Fact colors={colors} label="Prisregulering / indeks" value={indexLabel(contract.fields?.indexId)} wide />
            </View>

            <Text style={styles.groupTitle}>Varighet og fornyelse</Text>
            <View style={styles.grid}>
              <Fact
                colors={colors}
                label="Fornyelse"
                value={RENEWAL_TYPES.find((row) => row.id === (contract.renewal?.type || 'ingen'))?.label}
              />
              <Fact colors={colors} label="Fornyes til" value={contract.renewal?.until} />
              <Fact
                colors={colors}
                label="Varsel før utløp"
                value={contract.renewal?.noticeDays != null ? `${contract.renewal.noticeDays} dager` : ''}
              />
            </View>
          </View>
        )}
      </Section>

      <Section colors={colors} title="Kundeforhold og ansvarlig" open={open.kunde} onToggle={() => toggle('kunde')}>
        {customer ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 16 }}>{customer.name}</Text>
            <Text style={{ color: colors.muted }}>
              {[customer.kind === 'person' ? 'Privatkunde' : 'Virksomhet', formatOrgnr(customer.orgnr), customer.contactName].filter(Boolean).join(' · ')}
            </Text>
            {!editing ? (
              <OwnerPicker
                colors={colors}
                people={people}
                value={customer.ownerUid}
                label="Ansvarlig for avtalen"
                onChange={(person) => onAssignOwner?.(person)}
              />
            ) : null}
            <TouchableOpacity onPress={() => onOpenCustomer?.(customer.id)} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Åpne kundeforholdet</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={{ color: colors.muted }}>Ingen kunde er koblet. Rediger avtalen for å fylle oppdragsgiver, eller koble kunden fra kunderegisteret.</Text>
        )}
      </Section>

      <Section colors={colors} title={`Dokumenter (${(contract.documents || []).length})`} open={open.dokumenter} onToggle={() => toggle('dokumenter')}>
        <View style={{ gap: 10 }}>
          {(contract.documents || []).length ? contract.documents.map((doc) => (
            <View key={doc.id} style={{ gap: 4 }}>
              <TouchableOpacity
                onPress={() => openAgreementDocument(doc)}
                accessibilityRole="link"
                disabled={!documentIsOpenable(doc)}
              >
                <Text style={{ color: documentIsOpenable(doc) ? colors.brand : colors.muted, textDecorationLine: documentIsOpenable(doc) ? 'underline' : 'none' }}>
                  {doc.name}{documentHasOriginalFile(doc) ? '' : ' · mangler originalfil'}
                </Text>
              </TouchableOpacity>
              {!documentHasOriginalFile(doc) ? (
                <TouchableOpacity onPress={() => attachOriginal(doc)} accessibilityRole="button" disabled={!!docBusyId}>
                  <Text style={{ color: colors.brand }}>
                    {docBusyId === doc.id ? 'Laster opp…' : 'Last opp original PDF'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )) : <Text style={{ color: colors.muted }}>Ingen dokumenter er lagt ved.</Text>}
          <TouchableOpacity onPress={addDocuments} accessibilityRole="button" disabled={!!docBusyId}>
            <Text style={{ color: colors.brand }}>
              {docBusyId === 'new' ? 'Laster opp…' : 'Legg til dokumenter'}
            </Text>
          </TouchableOpacity>
          {docNote ? <Text style={{ color: colors.muted }}>{docNote}</Text> : null}
        </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
  kicker: { color: '#64748b', fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: '700' },
  hero: { borderWidth: 1, borderRadius: 16, padding: 18, gap: 10 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heroFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 4 },
  heroFact: { minWidth: 140, flexGrow: 1, gap: 2 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionBody: { gap: 10, paddingTop: 4 },
  save: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  topBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fact: { flexGrow: 1, flexBasis: 200, minWidth: 170, gap: 4 },
  factWide: { flexBasis: '100%', minWidth: '100%' },
  groupTitle: { color: '#64748b', fontSize: 12, fontWeight: '700', letterSpacing: 0.35, textTransform: 'uppercase', marginTop: 4 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  btn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  chip: { borderWidth: 1, borderColor: 'transparent', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  dateBox: { borderWidth: 1, borderRadius: 10, justifyContent: 'center' },
  dateField: { paddingHorizontal: 10, paddingVertical: 8, minHeight: 42 },
  brregBox: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
});
