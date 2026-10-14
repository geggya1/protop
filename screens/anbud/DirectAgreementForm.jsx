import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateField from '../../components/DateField';
import LocationPicker from '../../components/LocationPicker';
import { interpretAvtale } from '../../src/indeksregulering/aiClient';
import { extractContractText, MAX_LOCAL_PDF_BYTES, pdfTextLooksReadable } from '../../src/indeksregulering/extractText';
import { emptyDraft } from '../../src/indeksregulering/engine';
import { interpretDocuments, mergeInterpretation } from '../../src/indeksregulering/interpret';
import { fetchSeriesById } from '../../src/indeksregulering/ssb';
import { indexDraftFromInterpretation, inputFromInterpretation } from '../../src/anbud/directContract';
import {
  AGREEMENT_KINDS,
  COVER_FIELD_GROUPS,
  DEFAULT_INDEX_ID,
  RENEWAL_TYPES,
  emptyCoverForm,
  emptyOption,
  parentOptions,
} from '../../src/anbud/agreementTemplate';
import { INDEX_SERIES } from '../../src/indeksregulering/catalog';
import { formatOrgnr, matchCustomer, namesLikelyMatch, normalizeOrgnr, companyFollowUpPeople } from '../../src/anbud/customers';
import { nextOppdragId, nextSystemId } from '../../src/anbud/numbering';
import { agreementSummary, emailLooksLikeSupplier, registerConfirmText, reviewFlags } from '../../src/anbud/fieldReview';
import { uploadAgreementFile } from '../../src/anbud/contractFiles';
import { AGREEMENT_IMPORT_ACCEPT, documentHasOriginalFile, documentIsOpenable, openAgreementDocument } from '../../src/anbud/openDocument';
import { pickDocument } from '../../src/utils/media';
import { dateKey } from '../../src/utils/dates';
import { useLayout } from '../../src/theme';
import AgreementCustomerField from './AgreementCustomerField';
import AgreementDocumentPreview from './AgreementDocumentPreview';
import AgreementPersonField from './AgreementPersonField';
import AgreementProjectField from './AgreementProjectField';

const DATE_FIELD_KEYS = new Set(['start', 'end', 'contractDate', 'renewalUntil']);

function isoFromDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return dateKey(value) || '';
}

const ACCEPT = AGREEMENT_IMPORT_ACCEPT;
const MAX_REMOTE_BYTES = 2500000;

function yieldUi() {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

const MULTILINE = new Set(['description', 'biomkostninger', 'paymentTerms', 'specialTerms', 'honorarForm']);
const NUMBER_PLACEHOLDERS = {
  systemId: 'Settes automatisk',
  oppdragId: 'Settes automatisk per kunde',
  value: 'Beløp eks. mva',
  indexBase: 'Hentes fra SSB',
};
const READ_ONLY_KEYS = new Set(['systemId', 'oppdragId', 'supplier', 'supplierOrgnr', 'indexBase']);
const SKIP_GENERIC = new Set(['kind', 'parentId', 'address', 'indexId', 'leaderName']);

function emptyForm() {
  return { ...emptyCoverForm(), options: [] };
}

function formFromInput(input, current = emptyForm()) {
  const next = {
    ...emptyForm(),
    ...current,
    title: input.title || '',
    buyer: input.buyer || '',
    supplier: input.supplier || '',
    projectName: input.projectName || '',
    description: input.description || '',
    address: input.address || '',
    kind: input.kind || current.kind || '',
    value: input.value == null || input.value === '' ? '' : String(input.value),
    start: input.start || '',
    end: input.end || '',
    projectId: current.projectId || input.projectId || '',
    parentId: current.parentId || input.parentId || '',
    customerId: current.customerId || input.customerId || '',
    systemId: input.systemId || current.systemId || '',
    oppdragId: input.oppdragId || current.oppdragId || input.reference || input.fields?.reference || '',
    honorar: input.honorar || input.fields?.honorar || '',
    place: input.place || input.fields?.place || '',
    poNumber: input.poNumber || input.fields?.poNumber || '',
    orgnr: input.orgnr || input.fields?.orgnr || '',
    supplierOrgnr: input.supplierOrgnr || input.fields?.supplierOrgnr || '',
    personnummer: input.personnummer || input.fields?.personnummer || '',
    contactName: input.contactName || input.fields?.contactName || '',
    email: input.email || input.fields?.email || '',
    phone: input.phone || input.fields?.phone || '',
    reference: input.reference || input.fields?.reference || '',
    ownerUid: current.ownerUid || input.ownerUid || '',
    ownerName: current.ownerName || input.ownerName || '',
    standard: input.standard || input.fields?.standard || '',
    indexId: input.indexId || input.fields?.indexId || '',
    surchargePercent: input.surchargePercent || input.fields?.surchargePercent || '',
    contractDate: input.contractDate || input.fields?.contractDate || '',
  };
  if (emailLooksLikeSupplier(next.email, next.supplier, next.buyer)) next.email = '';
  return next;
}

async function bytesFromFile(file) {
  let blob = file?.blob || null;
  if (!blob && file?.uri && typeof fetch === 'function') {
    const response = await fetch(file.uri);
    blob = await response.blob();
  }
  if (!blob || typeof blob.arrayBuffer !== 'function') {
    throw new Error('Kunne ikke lese filen.');
  }
  if (typeof blob.slice === 'function' && blob.size > MAX_REMOTE_BYTES) {
    blob = blob.slice(0, MAX_REMOTE_BYTES);
  }
  return new Uint8Array(await blob.arrayBuffer());
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function attachmentFromPick(file) {
  let blob = file?.blob || null;
  if (!blob && file?.uri && typeof fetch === 'function') {
    blob = await (await fetch(file.uri)).blob();
  }
  const name = file?.name || 'Avtale';
  const mimeType = blob?.type || file?.mimeType || 'application/octet-stream';
  const size = blob?.size || file?.size || 0;
  let dataUrl = '';
  if (blob && size > 0 && size <= 700000) {
    if (typeof FileReader === 'function') {
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } else if (typeof Buffer !== 'undefined') {
      dataUrl = `data:${mimeType};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
    }
  }
  return { name, mimeType, size, dataUrl, uri: file?.uri || '' };
}

function Field({ colors, field, value, onChange, warning, hint }) {
  const warnColor = colors.warn || '#d97706';
  const readOnly = field.readOnly || READ_ONLY_KEYS.has(field.key);
  if (field.key === 'indexId') {
    const selected = INDEX_SERIES.find((row) => row.id === value) || INDEX_SERIES.find((row) => row.id === DEFAULT_INDEX_ID);
    return (
      <View style={{ gap: 6, flexGrow: 1, flexBasis: '100%', minWidth: 220 }}>
        <View style={styles.labelRow}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{field.label}</Text>
          {warning ? <Text style={{ color: warnColor, fontWeight: '700' }}>!</Text> : null}
        </View>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>
          {selected ? `${selected.name} · tabell ${selected.table}` : 'Ikke valgt'}
        </Text>
        <View style={styles.row}>
          {INDEX_SERIES.map((row) => (
            <TouchableOpacity
              key={row.id}
              onPress={() => onChange(row.id)}
              accessibilityRole="button"
              style={[styles.chip, value === row.id && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}
            >
              <Text style={{ color: value === row.id ? colors.brand : colors.ink }}>
                {row.table} · {row.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {hint ? <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text> : null}
        {warning ? <Text style={{ color: warnColor, fontSize: 12 }}>{warning}</Text> : null}
      </View>
    );
  }
  if (DATE_FIELD_KEYS.has(field.key)) {
    return (
      <View style={{ gap: 4, flexGrow: 1, flexBasis: 200, minWidth: 160 }}>
        <View style={styles.labelRow}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{field.label}</Text>
          {warning ? <Text style={{ color: warnColor, fontWeight: '700' }}>!</Text> : null}
        </View>
        <View style={[styles.dateBox, { borderColor: warning ? warnColor : colors.line, backgroundColor: colors.bg }]}>
          <DateField
            value={value || null}
            onChange={(date) => onChange(isoFromDate(date))}
            placeholder="Velg dato"
            iconColor={colors.brand}
            style={styles.dateField}
            textStyle={{ color: value ? colors.ink : colors.placeholder, fontSize: 15 }}
          />
        </View>
        {warning ? <Text style={{ color: warnColor, fontSize: 12 }}>{warning}</Text> : null}
      </View>
    );
  }
  return (
    <View style={{ gap: 4, flexGrow: 1, flexBasis: MULTILINE.has(field.key) ? '100%' : 200, minWidth: 160 }}>
      <View style={styles.labelRow}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{field.label}</Text>
        {warning ? <Text style={{ color: warnColor, fontWeight: '700' }}>!</Text> : null}
      </View>
      <TextInput
        value={value}
        onChangeText={readOnly ? undefined : onChange}
        editable={!readOnly}
        placeholder={NUMBER_PLACEHOLDERS[field.key] || ''}
        placeholderTextColor={colors.placeholder}
        multiline={MULTILINE.has(field.key)}
        keyboardType={field.key === 'value' || field.key === 'surchargePercent' || field.key === 'orgnr' || field.key === 'supplierOrgnr' || field.key === 'engagementPercent' ? 'decimal-pad' : 'default'}
        style={[
          styles.input,
          MULTILINE.has(field.key) && styles.inputMulti,
          {
            color: colors.ink,
            borderColor: warning ? warnColor : colors.line,
            backgroundColor: readOnly ? colors.sunken : colors.bg,
          },
        ]}
      />
      {field.key === 'value' ? <Text style={{ color: colors.muted, fontSize: 12 }}>Eks. mva</Text> : null}
      {hint ? <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text> : null}
      {warning ? <Text style={{ color: warnColor, fontSize: 12 }}>{warning}</Text> : null}
    </View>
  );
}

function Drawer({ colors, title, open, onToggle, badge, children }) {
  return (
    <View style={[styles.drawer, { borderColor: colors.line, backgroundColor: colors.bg }]}>
      <TouchableOpacity onPress={onToggle} accessibilityRole="button" style={styles.drawerHead}>
        <Text style={{ color: colors.ink, fontWeight: '700', flex: 1 }}>{title}</Text>
        {badge ? <Text style={{ color: colors.warn || '#d97706', fontWeight: '700' }}>!</Text> : null}
        <Text style={{ color: colors.muted }}>{open ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {open ? <View style={styles.drawerBody}>{children}</View> : null}
    </View>
  );
}

export default function DirectAgreementForm({
  colors,
  companyId = '',
  companyName = '',
  companyOrgnr = '',
  projects = [],
  contracts = [],
  customers = [],
  parentId = '',
  kind = '',
  customerId = '',
  people = [],
  onCancel,
  onRegister,
  onOpenCustomer,
  onCustomersChanged,
}) {
  const [form, setForm] = useState(() => ({
    ...emptyForm(),
    parentId,
    kind,
    customerId,
    supplier: companyName || '',
    supplierOrgnr: formatOrgnr(companyOrgnr) || companyOrgnr || '',
    indexId: DEFAULT_INDEX_ID,
  }));
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);
  const [files, setFiles] = useState([]);
  const [previewId, setPreviewId] = useState('');
  const [registerHit, setRegisterHit] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [indexHint, setIndexHint] = useState('');
  const [open, setOpen] = useState({
    dokumenter: true,
    avtalen: true,
    sted: true,
    kunde: true,
    leverandor: true,
    honorar: true,
    ramme: false,
    opsjoner: false,
  });
  const { isPhone } = useLayout();
  const splitPreview = !isPhone;

  useEffect(() => {
    if (!companyName && !companyOrgnr) return;
    setForm((current) => ({
      ...current,
      supplier: current.supplier || companyName || '',
      supplierOrgnr: current.supplierOrgnr || formatOrgnr(companyOrgnr) || companyOrgnr || '',
    }));
  }, [companyName, companyOrgnr]);

  useEffect(() => {
    if (!customerId) return;
    const hit = customers.find((row) => row.id === customerId);
    if (!hit) return;
    setForm((current) => ({
      ...current,
      customerId,
      buyer: current.buyer || hit.name,
      orgnr: current.orgnr || hit.orgnr,
      personnummer: current.personnummer || hit.personnummer,
      address: current.address || hit.address,
      place: current.place || hit.place,
      postalCode: current.postalCode || hit.postalCode || '',
      contactName: current.contactName || hit.contactName,
      email: current.email || hit.email,
      phone: current.phone || hit.phone,
      ownerUid: current.ownerUid || hit.ownerUid || '',
      ownerName: current.ownerName || hit.ownerName || '',
    }));
  }, [customerId, customers]);

  useEffect(() => {
    const indexId = form.indexId || DEFAULT_INDEX_ID;
    let live = true;
    setIndexHint('Henter siste kjente indeks fra SSB…');
    fetchSeriesById(indexId).then((bundle) => {
      if (!live) return;
      const latest = bundle?.series?.[indexId]?.latest;
      if (!latest) {
        setIndexHint('Kunne ikke hente indeksverdi. Velg tabell og prøv igjen.');
        return;
      }
      const label = `${latest.period || latest.key || ''} = ${latest.value}`.trim();
      setIndexHint(`Indeks 1 låses til siste kjente verdi: ${label} (SSB tabell ${bundle.series[indexId].table || ''}).`);
      setForm((current) => (
        current.indexBase === label ? current : { ...current, indexId, indexBase: label }
      ));
    }).catch(() => {
      if (live) setIndexHint('Kunne ikke hente indeksverdi akkurat nå.');
    });
    return () => { live = false; };
  }, [form.indexId]);

  const customerHint = matchCustomer(customers, {
    name: form.buyer,
    buyer: form.buyer,
    orgnr: form.orgnr,
    personnummer: form.personnummer,
    address: form.address,
    place: form.place,
    contactName: form.contactName,
    email: form.email,
    phone: form.phone,
  });
  const flags = reviewFlags(form, { registerHit });
  const summary = agreementSummary(form);
  const confirmText = registerConfirmText(form, customerHint, registerHit);
  const parents = parentOptions(contracts);
  const followPeople = useMemo(() => {
    const rows = Array.isArray(people) ? people : [];
    const prepared = rows.filter((row) => row && (row.uid || row.id) && row.name && (row.source || !row.role));
    if (prepared.length) return prepared;
    return companyFollowUpPeople(rows);
  }, [people]);
  const previewSystem = form.systemId || nextSystemId(contracts);
  const previewOppdrag = form.oppdragId || nextOppdragId(contracts, form.customerId, form.buyer);

  function patch(part) {
    setForm((current) => ({ ...current, ...part }));
  }

  async function applyDocs(docs, note) {
    const usable = docs.filter((doc) => {
      const body = String(doc?.text || '').trim();
      return body.length >= 20 && pdfTextLooksReadable(body);
    });
    let merged = interpretDocuments(usable);
    for (const doc of docs) {
      if (doc?.extracted && typeof doc.extracted === 'object') {
        merged = mergeInterpretation(merged, doc.extracted, String(doc.text || ''));
      }
    }
    try {
      const remote = await interpretAvtale({ documents: usable });
      if (remote?.extracted) {
        merged = mergeInterpretation(merged, remote.extracted, usable.map((doc) => doc.text).filter(Boolean).join('\n'));
      }
    } catch {
      // Lokal lesing / per-fil OCR brukes videre.
    }
    const next = inputFromInterpretation(merged, { documents: docs });
    setPayload(next);
    setFiles(docs);
    setPreviewId((current) => (
      docs.some((doc) => doc.id === current) ? current : (docs[0]?.id || '')
    ));
    setForm((current) => formFromInput(next, current));
    setStatus(note);
    setError('');
  }

  async function storeOriginal(file, attached = {}, salt = '') {
    if (!companyId) return { url: '', storagePath: '', size: attached.size || file.size || 0 };
    const uploaded = await uploadAgreementFile(companyId, {
      blob: file.blob || attached.blob || null,
      uri: attached.uri || file.uri || '',
      name: attached.name || file.name || 'Avtale.pdf',
      mimeType: attached.mimeType || file.mimeType || 'application/pdf',
      size: attached.size || file.size || 0,
    }, { salt });
    return uploaded;
  }

  function documentRow(existing, attached, file, text, original = {}, index = 0, extracted = null) {
    return {
      id: `dok-${Date.now()}-${existing.length + index}`,
      name: attached.name || file.name || 'Avtale',
      text,
      role: (existing.length + index) ? 'vedlegg' : 'hoved',
      mimeType: attached.mimeType || file.mimeType || 'application/pdf',
      interpreted: String(text || '').trim().length >= 20 || Boolean(extracted),
      dataUrl: original.url ? '' : (attached.dataUrl || ''),
      url: original.url || '',
      storagePath: original.storagePath || '',
      uri: original.url ? '' : (attached.uri || file.uri || ''),
      size: original.size || attached.size || file.size || 0,
      ...(extracted ? { extracted } : {}),
    };
  }

  async function readOneFile(file, existing, index, total) {
    const label = total > 1 ? ` (${index + 1}/${total})` : '';
    setStatus(`Lagrer originalfil${label}…`);
    await yieldUi();
    const attached = await attachmentFromPick(file).catch(() => ({
      name: file.name || 'Avtale',
      mimeType: file.mimeType || '',
      size: file.size || 0,
      dataUrl: '',
      uri: file.uri || '',
    }));
    let original = { url: '', storagePath: '', size: attached.size || file.size || 0 };
    try {
      original = await storeOriginal(file, attached, `${Date.now()}-${index}`);
    } catch (cause) {
      if (!attached.dataUrl) throw cause;
    }
    setStatus(`Leser dokumentet${label}…`);
    await yieldUi();
    let bytes = await bytesFromFile(file);
    const pdf = /\.pdf$/i.test(file.name || '') || /pdf/i.test(file.mimeType || '');
    if (pdf && bytes.length > MAX_LOCAL_PDF_BYTES) {
      if (bytes.length > MAX_REMOTE_BYTES) bytes = bytes.subarray(0, MAX_REMOTE_BYTES);
      const remote = await interpretAvtale({
        fileName: file.name || attached.name || 'Avtale.pdf',
        mimeType: file.mimeType || attached.mimeType || 'application/pdf',
        fileBase64: bytesToBase64(bytes),
      });
      if (!remote?.extracted) throw new Error(`Kunne ikke lese ${attached.name || file.name || 'PDF-en'}.`);
      return documentRow(existing, attached, file, String(remote.text || '').trim(), original, index, remote.extracted);
    }
    try {
      const text = await extractContractText(bytes, file.name, file.mimeType);
      if (pdf && !pdfTextLooksReadable(text)) {
        throw new Error('PDF_TEXT_UNREADABLE');
      }
      return documentRow(existing, attached, file, text, original, index);
    } catch {
      if (bytes.length > MAX_REMOTE_BYTES) bytes = bytes.subarray(0, MAX_REMOTE_BYTES);
      setStatus(`Leser skannet dokument${label}…`);
      await yieldUi();
      try {
        const remote = await interpretAvtale({
          fileName: file.name || attached.name || 'Avtale.pdf',
          mimeType: file.mimeType || attached.mimeType || 'application/pdf',
          fileBase64: bytesToBase64(bytes),
        });
        if (remote?.extracted || String(remote?.text || '').trim()) {
          return documentRow(
            existing,
            attached,
            file,
            String(remote.text || '').trim(),
            original,
            index,
            remote.extracted || null,
          );
        }
      } catch {
        // Originalfilen er lagret — forhåndsvisning og manuell utfylling kan fortsette.
      }
      if (original.url || attached.dataUrl || attached.uri || file.uri) {
        return documentRow(existing, attached, file, '', original, index);
      }
      throw new Error(`Kunne ikke lese ${attached.name || file.name || 'dokumentet'}.`);
    }
  }

  async function importFile() {
    setError('');
    const picked = await pickDocument({ accept: ACCEPT, multiple: true });
    const list = (Array.isArray(picked) ? picked : (picked ? [picked] : [])).filter(Boolean);
    if (!list.length) return;
    setReading(true);
    setStatus(list.length > 1 ? `Leser ${list.length} dokumenter…` : 'Leser dokumentet…');
    await yieldUi();
    try {
      const added = [];
      for (let index = 0; index < list.length; index += 1) {
        added.push(await readOneFile(list[index], files, index, list.length));
      }
      const docs = [...files, ...added];
      const note = list.length > 1
        ? `${list.length} dokumenter er vedlagt. Kontroller feltene merket med ! før du registrerer.`
        : 'Dokumentet er vedlagt. Kontroller feltene merket med ! før du registrerer.';
      await applyDocs(docs, note);
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke lese dokumentene. Prøv en annen fil, eller fyll inn feltene manuelt.');
    } finally {
      setReading(false);
    }
  }

  async function importDropped(fileList) {
    const list = (fileList || []).slice(0, 8).map((file) => ({
      name: file.name,
      mimeType: file.type || file.mimeType || 'application/octet-stream',
      size: file.size || 0,
      blob: file.blob || file,
      uri: file.uri || '',
    }));
    if (!list.length) return;
    setError('');
    setReading(true);
    setStatus(list.length > 1 ? `Leser ${list.length} dokumenter…` : 'Leser dokumentet…');
    await yieldUi();
    try {
      const added = [];
      for (let index = 0; index < list.length; index += 1) {
        added.push(await readOneFile(list[index], files, index, list.length));
      }
      await applyDocs([...files, ...added], list.length > 1
        ? `${list.length} dokumenter er vedlagt. Kontroller feltene merket med ! før du registrerer.`
        : 'Dokumentet er vedlagt. Kontroller feltene merket med ! før du registrerer.');
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke lese dokumentene.');
    } finally {
      setReading(false);
    }
  }

  function removeFile(id) {
    const docs = files.filter((doc) => doc.id !== id);
    setFiles(docs);
    setPreviewId((current) => (
      docs.some((doc) => doc.id === current) ? current : (docs[0]?.id || '')
    ));
    if (docs.some((doc) => doc.text)) applyDocs(docs, 'Dokumentlisten er oppdatert.');
    else setPayload((current) => (current ? { ...current, documents: docs } : current));
  }

  function selectPreview(id) {
    setPreviewId(id);
  }

  function applyCustomerRow(customer, create = false) {
    if (!customer && !create) {
      patch({ customerId: '', createCustomer: false });
      return;
    }
    if (create) {
      patch({
        customerId: '',
        createCustomer: true,
        buyer: form.buyer || customer?.name || '',
        orgnr: form.orgnr || customer?.orgnr || '',
        personnummer: form.personnummer || customer?.personnummer || '',
      });
      return;
    }
    patch({
      customerId: customer.id,
      createCustomer: false,
      buyer: customer.name || form.buyer,
      orgnr: customer.orgnr || form.orgnr,
      personnummer: customer.personnummer || form.personnummer,
      address: form.address || customer.address || '',
      place: form.place || customer.place || '',
      postalCode: form.postalCode || customer.postalCode || '',
      contactName: form.contactName || customer.contactName || '',
      email: form.email || customer.email || '',
      phone: form.phone || customer.phone || '',
      buyerAddress: form.buyerAddress || customer.address || '',
    });
  }

  function applyBrregDraft(draft, existing) {
    if (!draft) return;
    setRegisterHit({ name: draft.name, orgnr: draft.orgnr, address: draft.address, place: draft.place });
    if (existing) {
      applyCustomerRow(existing);
      return;
    }
    patch({
      customerId: '',
      createCustomer: true,
      buyer: draft.name || form.buyer,
      orgnr: draft.orgnr || form.orgnr,
      personnummer: '',
      address: form.address || draft.address || '',
      place: form.place || draft.place || '',
      postalCode: form.postalCode || draft.postalCode || '',
      buyerAddress: form.buyerAddress || draft.address || '',
      email: form.email || draft.email || '',
      phone: form.phone || draft.phone || '',
    });
  }

  function useCustomer(customer, create = false) {
    applyCustomerRow(customer, create);
  }

  async function submit() {
    const title = String(form.title || '').trim();
    const buyer = String(form.buyer || '').trim();
    const projectName = String(form.projectName || '').trim() || title;
    const input = {
      ...form,
      title,
      buyer,
      projectName,
      fields: {
        ...(payload?.fields || {}),
        standard: form.standard,
        indexId: form.indexId,
        indexBase: form.indexBase,
        honorar: '',
        honorarForm: form.honorarForm,
        biomkostninger: form.biomkostninger,
        paymentTerms: form.paymentTerms,
        specialTerms: form.specialTerms,
        place: form.place,
        postalCode: form.postalCode,
        address: form.address,
        gnrBnr: form.gnrBnr,
        engagementPercent: form.engagementPercent,
        description: form.description,
        poNumber: form.poNumber,
        orgnr: form.orgnr,
        supplierOrgnr: form.supplierOrgnr,
        personnummer: form.personnummer,
        contactName: form.contactName,
        email: form.email,
        phone: form.phone,
        buyerAddress: form.buyerAddress,
        invoiceMethod: form.invoiceMethod,
        invoiceAttn: form.invoiceAttn,
        leaderUid: form.leaderUid,
        leaderName: form.leaderName,
        leaderEmail: form.leaderEmail,
        leaderPhone: form.leaderPhone,
        resourceName: form.resourceName,
        resourceEmail: form.resourceEmail,
        resourcePhone: form.resourcePhone,
        reference: form.oppdragId || form.reference,
        surchargePercent: form.surchargePercent,
        contractDate: form.contractDate,
        projectName,
      },
      systemId: form.systemId,
      oppdragId: form.oppdragId,
      ownerUid: form.ownerUid,
      ownerName: form.ownerName,
      documents: files,
      options: (form.options || []).filter((row) => String(row.title || '').trim()),
      renewal: {
        type: form.renewalType || 'ingen',
        until: form.renewalUntil,
        noticeDays: form.renewalNoticeDays,
      },
      createCustomer: !form.customerId && customerHint.status === 'new',
      indexDraft: payload?.indexDraft
        ? {
          ...payload.indexDraft,
          title,
          buyer,
          startDate: form.start,
          endDate: form.end,
        }
        : indexDraftFromInterpretation(emptyDraft({
          title,
          buyer,
          startDate: form.start,
          endDate: form.end,
        }), form),
    };
    const result = await onRegister(input);
    if (result?.ok) {
      setForm(emptyForm());
      setPayload(null);
      setFiles([]);
      setPreviewId('');
      setStatus('');
    }
  }

  const kindFields = useMemo(() => {
    const hide = String(form.personnummer || '').replace(/\D/g, '').length === 11 && !normalizeOrgnr(form.orgnr)
      ? 'orgnr'
      : 'personnummer';
    return COVER_FIELD_GROUPS.map((group) => ({
      ...group,
      fields: group.fields.filter((field) => field.key !== hide),
    }));
  }, [form.orgnr, form.personnummer]);

  function toggle(id) {
    setOpen((current) => ({ ...current, [id]: !current[id] }));
  }

  const warnKeys = Object.keys(flags);
  const groupBadge = (id) => kindFields.find((group) => group.id === id)?.fields.some((field) => flags[field.key]);

  const previewPane = (
    <AgreementDocumentPreview
      colors={colors}
      documents={files}
      selectedId={previewId}
      onSelect={selectPreview}
      minHeight={splitPreview ? 560 : 360}
    />
  );

  const fields = (
    <View style={[styles.card, styles.fieldsPane, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Text style={[styles.h, { color: colors.ink }]}>Registrer avtale</Text>
      {summary && (form.title || form.buyer) ? (
        <View style={[styles.summary, { borderColor: colors.brand, backgroundColor: colors.brandSoft || colors.bg }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{summary}</Text>
          {warnKeys.length ? (
            <Text style={{ color: colors.warn || '#d97706' }}>
              {warnKeys.length} felt trenger kontroll.
            </Text>
          ) : (
            <Text style={{ color: colors.muted }}>Kontroller opplysningene og registrer.</Text>
          )}
        </View>
      ) : (
        <Text style={{ color: colors.muted }}>
          Last opp avtaledokumentene. Kjente felt fylles ut til venstre. Originalfilen lagres og forhåndsvises til høyre. Felt med ! må kontrolleres.
        </Text>
      )}
      {reading ? (
        <View style={[styles.banner, { borderColor: colors.brand, backgroundColor: colors.brandSoft || colors.bg }]}>
          <Text style={{ color: colors.brand, fontWeight: '600' }}>{status || 'Leser avtalen…'}</Text>
        </View>
      ) : null}
      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}

      <View style={styles.row}>
        <TouchableOpacity onPress={onCancel} accessibilityRole="button">
          <Text style={{ color: colors.muted }}>Avbryt</Text>
        </TouchableOpacity>
      </View>

      <Drawer colors={colors} title={`Dokumenter (${files.length})`} open={open.dokumenter} onToggle={() => toggle('dokumenter')}>
        <View
          {...(Platform.OS === 'web' ? {
            onDragEnter: (event) => { event.preventDefault?.(); setDragOver(true); },
            onDragOver: (event) => { event.preventDefault?.(); setDragOver(true); },
            onDragLeave: () => setDragOver(false),
            onDrop: (event) => {
              event.preventDefault?.();
              setDragOver(false);
              const list = Array.from(event?.dataTransfer?.files || []);
              if (list.length) importDropped(list);
            },
          } : {})}
          style={[
            styles.drop,
            {
              borderColor: dragOver ? colors.brand : colors.line,
              backgroundColor: dragOver ? colors.sunken : colors.bg,
            },
          ]}
        >
          <Text style={{ color: colors.ink, fontWeight: '600' }}>
            {reading ? 'Leser dokumentet …' : 'Slipp avtaledokumenter her'}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>PDF, Word eller bilde — AI fyller feltene som kan leses</Text>
          <TouchableOpacity
            onPress={importFile}
            disabled={reading}
            accessibilityRole="button"
            style={[styles.save, { backgroundColor: colors.brand, opacity: reading ? 0.6 : 1 }]}
          >
            <Text style={{ color: '#fff' }}>{reading ? 'Leser…' : files.length ? 'Legg til dokumenter' : 'Last opp dokumenter'}</Text>
          </TouchableOpacity>
        </View>
        {files.length ? files.map((doc) => (
          <View key={doc.id} style={styles.row}>
            <TouchableOpacity
              onPress={() => {
                selectPreview(doc.id);
                if (!splitPreview && documentIsOpenable(doc)) openAgreementDocument(doc);
              }}
              accessibilityRole="button"
              style={{ flex: 1 }}
            >
              <Text style={{
                color: previewId === doc.id ? colors.brand : colors.ink,
                textDecorationLine: !splitPreview && documentIsOpenable(doc) ? 'underline' : 'none',
                fontWeight: previewId === doc.id ? '600' : '400',
              }}
              >
                {doc.name}{doc.interpreted ? ' · lest' : ''}{documentHasOriginalFile(doc) ? '' : ' · mangler originalfil'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => removeFile(doc.id)} accessibilityRole="button">
              <Text style={{ color: colors.muted }}>Fjern</Text>
            </TouchableOpacity>
          </View>
        )) : <Text style={{ color: colors.muted }}>Ingen dokument er lagt ved ennå.</Text>}
      </Drawer>

      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Avtaletype</Text>
        <View style={styles.row}>
          {AGREEMENT_KINDS.map((row) => (
            <TouchableOpacity key={row.id} onPress={() => patch({ kind: row.id })} accessibilityRole="button" style={[styles.chip, form.kind === row.id && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}>
              <Text style={{ color: form.kind === row.id ? colors.brand : colors.ink }}>{row.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        System-ID og Oppdrags-ID settes automatisk (neste: {previewSystem} · {previewOppdrag}). Feltene er ikke skrivbare.
      </Text>

      <AgreementCustomerField
        colors={colors}
        customers={customers}
        customerId={form.customerId}
        companyId={companyId}
        people={followPeople}
        label="Kunde / oppdragsgiver"
        onSelect={(customer) => applyCustomerRow(customer)}
        onBrregDraft={applyBrregDraft}
        onSavedState={(saved) => onCustomersChanged?.(saved)}
      />
      {confirmText ? <Text style={{ color: colors.ink }}>{confirmText}</Text> : null}
      {registerHit?.name && !namesLikelyMatch(form.buyer, registerHit.name) ? (
        <TouchableOpacity onPress={() => patch({ buyer: registerHit.name })} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Bruk navn fra Enhetsregisteret</Text>
        </TouchableOpacity>
      ) : null}
      {customerHint.status === 'match' && onOpenCustomer ? (
        <TouchableOpacity onPress={() => onOpenCustomer(customerHint.customer.id)} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Åpne kundeforhold</Text>
        </TouchableOpacity>
      ) : null}
      {customerHint.status === 'new' ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {form.createCustomer ? 'Ny kunde opprettes ved registrering.' : 'Kunden finnes ikke i registeret ennå — velg «Ny virksomhet»/«Privatkunde» i søket.'}
        </Text>
      ) : null}

      <AgreementPersonField
        colors={colors}
        people={followPeople}
        ownerUid={form.ownerUid}
        label="Ansvarlig for avtalen"
        placeholder="Søk blant ansatte"
        onSelect={(person) => patch({
          ownerUid: person?.uid || person?.id || '',
          ownerName: person?.name || '',
        })}
      />
      <AgreementProjectField
        colors={colors}
        projects={projects}
        projectId={form.projectId}
        onSelect={(project) => patch({
          projectId: project?.id || '',
          projectName: project?.name || form.projectName || '',
        })}
      />

      {kindFields.filter((group) => group.id !== 'ramme').map((group) => (
        <Drawer
          key={group.id}
          colors={colors}
          title={group.title}
          open={open[group.id] !== false}
          onToggle={() => toggle(group.id)}
          badge={groupBadge(group.id)}
        >
          {group.id === 'sted' ? (
            <View style={{ gap: 10 }}>
              <View style={{ gap: 4 }}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Adresse</Text>
                <LocationPicker
                  value={form.address ? { label: form.address, postnummer: form.postalCode, place: form.place } : null}
                  onChange={(loc) => {
                    if (!loc) {
                      patch({ address: '', postalCode: form.postalCode, place: form.place });
                      return;
                    }
                    const label = String(loc.label || '');
                    const parts = label.split(',').map((part) => part.trim()).filter(Boolean);
                    patch({
                      address: parts[0] || label,
                      postalCode: loc.postnummer || form.postalCode || '',
                      place: loc.place || parts[1] || parts[parts.length - 1] || form.place,
                    });
                  }}
                />
              </View>
              <View style={styles.grid}>
                {group.fields.filter((field) => !SKIP_GENERIC.has(field.key)).map((field) => (
                  <Field
                    key={field.key}
                    colors={colors}
                    field={field}
                    value={form[field.key] || ''}
                    warning={flags[field.key]}
                    onChange={(value) => patch({ [field.key]: value })}
                  />
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.grid}>
              {group.id === 'leverandor' ? (
                <AgreementPersonField
                  colors={colors}
                  people={followPeople}
                  ownerUid={form.leaderUid}
                  label="Oppdragsleder"
                  placeholder="Søk blant ansatte"
                  onSelect={(person) => patch({
                    leaderUid: person?.uid || person?.id || '',
                    leaderName: person?.name || '',
                    leaderEmail: person?.email || form.leaderEmail || '',
                    leaderPhone: person?.phone || form.leaderPhone || '',
                  })}
                />
              ) : null}
              {group.fields.filter((field) => !SKIP_GENERIC.has(field.key)).map((field) => (
                <Field
                  key={field.key}
                  colors={colors}
                  field={field}
                  value={form[field.key] || ''}
                  warning={flags[field.key]}
                  hint={field.key === 'indexId' || field.key === 'indexBase' ? indexHint : ''}
                  onChange={(value) => patch({ [field.key]: value })}
                />
              ))}
            </View>
          )}
        </Drawer>
      ))}

      {parents.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Tilknyttet avtale</Text>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => patch({ parentId: '' })} accessibilityRole="button">
              <Text style={{ color: form.parentId ? colors.muted : colors.brand }}>Ingen</Text>
            </TouchableOpacity>
            {parents.map((row) => (
              <TouchableOpacity key={row.id} onPress={() => patch({ parentId: row.id, buyer: form.buyer || row.buyer, customerId: form.customerId || row.customerId })} accessibilityRole="button">
                <Text style={{ color: form.parentId === row.id ? colors.brand : colors.ink }}>{row.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      <Drawer colors={colors} title="Varighet og fornyelse" open={!!open.ramme} onToggle={() => toggle('ramme')}>
        <View style={styles.row}>
          {RENEWAL_TYPES.map((row) => (
            <TouchableOpacity key={row.id} onPress={() => patch({ renewalType: row.id })} accessibilityRole="button">
              <Text style={{ color: form.renewalType === row.id ? colors.brand : colors.ink }}>{row.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.grid}>
          <Field colors={colors} field={{ key: 'renewalUntil', label: 'Fornyes til' }} value={form.renewalUntil} onChange={(renewalUntil) => patch({ renewalUntil })} />
          <Field colors={colors} field={{ key: 'renewalNoticeDays', label: 'Varsel før utløp (dager)' }} value={form.renewalNoticeDays} onChange={(renewalNoticeDays) => patch({ renewalNoticeDays })} />
        </View>
      </Drawer>

      <Drawer colors={colors} title={`Opsjoner (${(form.options || []).length})`} open={!!open.opsjoner} onToggle={() => toggle('opsjoner')}>
        {(form.options || []).map((row, index) => (
          <View key={row.id || index} style={styles.grid}>
            <Field colors={colors} field={{ key: 'title', label: 'Opsjon' }} value={row.title} onChange={(title) => {
              const options = [...(form.options || [])];
              options[index] = { ...row, title };
              patch({ options });
            }} />
            <Field colors={colors} field={{ key: 'start', label: 'Fra' }} value={row.start} onChange={(start) => {
              const options = [...(form.options || [])];
              options[index] = { ...row, start };
              patch({ options });
            }} />
            <Field colors={colors} field={{ key: 'end', label: 'Til' }} value={row.end} onChange={(end) => {
              const options = [...(form.options || [])];
              options[index] = { ...row, end };
              patch({ options });
            }} />
          </View>
        ))}
        <TouchableOpacity
          onPress={() => patch({ options: [...(form.options || []), emptyOption({ id: `opsjon-${Date.now()}`, title: '' })] })}
          accessibilityRole="button"
        >
          <Text style={{ color: colors.brand }}>Legg til opsjon</Text>
        </TouchableOpacity>
      </Drawer>

      <TouchableOpacity onPress={submit} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
        <Text style={{ color: '#fff' }}>Registrer avtale</Text>
      </TouchableOpacity>
    </View>
  );

  if (splitPreview) {
    return (
      <View style={styles.split}>
        <View style={styles.splitLeft}>{fields}</View>
        <View style={styles.splitRight}>{previewPane}</View>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {fields}
      {previewPane}
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 20, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 14 },
  fieldsPane: { flex: 1, minWidth: 0 },
  split: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, width: '100%' },
  splitLeft: { flexGrow: 1, flexShrink: 1, flexBasis: '54%', minWidth: 300 },
  splitRight: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: '40%',
    minWidth: 380,
    maxWidth: 640,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' ? { position: 'sticky', top: 12 } : null),
  },
  stack: { gap: 12, width: '100%' },
  save: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  drop: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  banner: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  summary: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  drawer: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  drawerHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  drawerBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { borderWidth: 1, borderColor: 'transparent', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  dateBox: { borderWidth: 1, borderRadius: 10, justifyContent: 'center' },
  dateField: { paddingHorizontal: 10, paddingVertical: 8, minHeight: 42 },
});
