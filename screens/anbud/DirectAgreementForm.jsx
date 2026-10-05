import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { interpretAvtale } from '../../src/indeksregulering/aiClient';
import { extractContractText, MAX_LOCAL_PDF_BYTES } from '../../src/indeksregulering/extractText';
import { emptyDraft } from '../../src/indeksregulering/engine';
import { interpretDocuments, mergeInterpretation } from '../../src/indeksregulering/interpret';
import { indexDraftFromInterpretation, inputFromInterpretation } from '../../src/anbud/directContract';
import {
  AGREEMENT_KINDS,
  COVER_FIELD_GROUPS,
  RENEWAL_TYPES,
  emptyCoverForm,
  emptyOption,
  parentOptions,
} from '../../src/anbud/agreementTemplate';
import { INDEX_SERIES } from '../../src/indeksregulering/catalog';
import { formatOrgnr, matchCustomer, customerDraftFromBrreg, namesLikelyMatch, normalizeOrgnr, companyFollowUpPeople } from '../../src/anbud/customers';
import { nextOppdragId, nextSystemId } from '../../src/anbud/numbering';
import { agreementSummary, emailLooksLikeSupplier, indexLabel, registerConfirmText, reviewFlags } from '../../src/anbud/fieldReview';
import { documentIsOpenable, openAgreementDocument } from '../../src/anbud/openDocument';
import { searchBrregCompanies } from '../../src/utils/boligmappaApis';
import { pickDocument } from '../../src/utils/media';
import OwnerPicker from './OwnerPicker';

const ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';
const MAX_REMOTE_BYTES = 2500000;

function yieldUi() {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

const MULTILINE = new Set(['description', 'honorar']);
const NUMBER_PLACEHOLDERS = {
  systemId: 'Neste ledige i systemet',
  oppdragId: 'Neste ledige for kunden',
};

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

function Field({ colors, field, value, onChange, warning }) {
  const warnColor = colors.warn || '#d97706';
  if (field.key === 'indexId') {
    const selected = INDEX_SERIES.find((row) => row.id === value);
    const choices = INDEX_SERIES.filter((row) => (
      ['ppi-byggeteknisk', 'bki-boligblokk', 'kpi', 'bki-bustader', 'bki-veg'].includes(row.id) || row.id === value
    ));
    return (
      <View style={{ gap: 4, flexGrow: 1, flexBasis: '100%', minWidth: 220 }}>
        <View style={styles.labelRow}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{field.label}</Text>
          {warning ? <Text style={{ color: warnColor, fontWeight: '700' }}>!</Text> : null}
        </View>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>{selected ? indexLabel(selected.id) : 'Ikke valgt'}</Text>
        <View style={styles.row}>
          {choices.map((row) => (
            <TouchableOpacity key={row.id} onPress={() => onChange(row.id)} accessibilityRole="button">
              <Text style={{ color: value === row.id ? colors.brand : colors.ink }}>{row.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {warning ? <Text style={{ color: warnColor, fontSize: 12 }}>{warning}</Text> : null}
      </View>
    );
  }
  return (
    <View style={{ gap: 4, flexGrow: 1, flexBasis: MULTILINE.has(field.key) ? '100%' : 220, minWidth: 180 }}>
      <View style={styles.labelRow}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{field.label}</Text>
        {warning ? <Text style={{ color: warnColor, fontWeight: '700' }}>!</Text> : null}
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={NUMBER_PLACEHOLDERS[field.key] || ''}
        placeholderTextColor={colors.placeholder}
        multiline={MULTILINE.has(field.key)}
        style={[
          styles.input,
          MULTILINE.has(field.key) && styles.inputMulti,
          { color: colors.ink, borderColor: warning ? warnColor : colors.line, backgroundColor: colors.bg },
        ]}
      />
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
}) {
  const [form, setForm] = useState(() => ({ ...emptyForm(), parentId, kind, customerId }));
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);
  const [pasted, setPasted] = useState('');
  const [files, setFiles] = useState([]);
  const [registerHit, setRegisterHit] = useState(null);
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
  const brregRef = useRef('');

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
      contactName: current.contactName || hit.contactName,
      email: current.email || hit.email,
      phone: current.phone || hit.phone,
      ownerUid: current.ownerUid || hit.ownerUid || '',
      ownerName: current.ownerName || hit.ownerName || '',
    }));
  }, [customerId, customers]);

  const orgnrDigits = normalizeOrgnr(form.orgnr) || String(form.orgnr || '').replace(/\D/g, '').slice(0, 9);
  useEffect(() => {
    if (orgnrDigits.length !== 9) {
      setRegisterHit(null);
      return undefined;
    }
    if (brregRef.current === orgnrDigits && registerHit?.orgnr === orgnrDigits) return undefined;
    let live = true;
    searchBrregCompanies(orgnrDigits, { size: 1 }).then((res) => {
      if (!live) return;
      brregRef.current = orgnrDigits;
      const draft = customerDraftFromBrreg(res.results?.[0]);
      if (!draft) {
        setRegisterHit(null);
        return;
      }
      setRegisterHit({ name: draft.name, orgnr: draft.orgnr, address: draft.address, place: draft.place });
      setForm((current) => ({
        ...current,
        orgnr: draft.orgnr || current.orgnr,
        personnummer: '',
        address: current.address || draft.address,
        place: current.place || draft.place,
      }));
    }).catch(() => {
      if (live) {
        brregRef.current = orgnrDigits;
        setRegisterHit(null);
      }
    });
    return () => { live = false; };
  }, [orgnrDigits]);

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
  const followPeople = companyFollowUpPeople(people);
  const previewSystem = form.systemId || nextSystemId(contracts);
  const previewOppdrag = form.oppdragId || nextOppdragId(contracts, form.customerId, form.buyer);

  function patch(part) {
    setForm((current) => ({ ...current, ...part }));
  }

  async function applyDocs(docs, note) {
    const local = interpretDocuments(docs.filter((doc) => String(doc?.text || '').trim().length >= 20));
    let merged = local;
    try {
      const remote = await interpretAvtale({ documents: docs });
      if (remote?.extracted) {
        merged = mergeInterpretation(local, remote.extracted, docs.map((doc) => doc.text).filter(Boolean).join('\n'));
      }
    } catch {
      // Lokal lesing brukes videre.
    }
    const next = inputFromInterpretation(merged, { documents: docs });
    setPayload(next);
    setFiles(docs);
    setForm((current) => formFromInput(next, current));
    setStatus(note);
    setError('');
  }

  async function applyRemote(file, bytes, existing, note, attached = {}) {
    const remote = await interpretAvtale({
      fileName: file.name || attached.name || 'Avtale.pdf',
      mimeType: file.mimeType || attached.mimeType || 'application/pdf',
      fileBase64: bytesToBase64(bytes),
    });
    if (!remote?.extracted) throw new Error('Kunne ikke lese PDF-en. Lim inn teksten under.');
    const text = String(remote.text || '').trim();
    const docs = [
      ...existing,
      {
        id: `dok-${Date.now()}`,
        name: attached.name || file.name || 'Avtale',
        text,
        role: existing.length ? 'vedlegg' : 'hoved',
        mimeType: attached.mimeType || file.mimeType || 'application/pdf',
        interpreted: text.length >= 20,
        dataUrl: attached.dataUrl || '',
        uri: attached.uri || file.uri || '',
        size: attached.size || 0,
      },
    ];
    const merged = mergeInterpretation(null, remote.extracted, text);
    const next = inputFromInterpretation(merged, { documents: docs });
    setPayload(next);
    setFiles(docs);
    setForm((current) => formFromInput(next, current));
    setStatus(note);
    setError('');
  }

  async function importFile() {
    setError('');
    const file = await pickDocument({ accept: ACCEPT });
    if (!file) return;
    setReading(true);
    setStatus('Leser dokumentet…');
    await yieldUi();
    try {
      const attached = await attachmentFromPick(file).catch(() => ({
        name: file.name || 'Avtale',
        mimeType: file.mimeType || '',
        size: file.size || 0,
        dataUrl: '',
        uri: file.uri || '',
      }));
      let bytes = await bytesFromFile(file);
      const pdf = /\.pdf$/i.test(file.name || '') || /pdf/i.test(file.mimeType || '');
      const sendRemote = async (note) => {
        if (bytes.length > MAX_REMOTE_BYTES) {
          setStatus('Filen er stor. Leser starten med OCR og KI…');
          await yieldUi();
          bytes = bytes.subarray(0, MAX_REMOTE_BYTES);
        }
        await applyRemote(file, bytes, files, note, attached);
      };
      if (pdf && bytes.length > MAX_LOCAL_PDF_BYTES) {
        await sendRemote('Dokumentet er lest. Kontroller feltene merket med ! før du registrerer.');
        return;
      }
      try {
        const text = await extractContractText(bytes, file.name, file.mimeType);
        const docs = [
          ...files,
          {
            id: `dok-${Date.now()}`,
            name: attached.name || file.name || 'Avtale',
            text,
            role: files.length ? 'vedlegg' : 'hoved',
            mimeType: attached.mimeType || file.mimeType || '',
            interpreted: true,
            dataUrl: attached.dataUrl || '',
            uri: attached.uri || file.uri || '',
            size: attached.size || 0,
          },
        ];
        await applyDocs(docs, 'Dokumentet er vedlagt. Kontroller feltene merket med ! før du registrerer.');
      } catch {
        setStatus('Leser skannet dokument…');
        await yieldUi();
        await sendRemote('Dokumentet er vedlagt. Kontroller feltene merket med ! før du registrerer.');
      }
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke lese dokumentet. Lim inn teksten under.');
    } finally {
      setReading(false);
    }
  }

  function removeFile(id) {
    const docs = files.filter((doc) => doc.id !== id);
    setFiles(docs);
    if (docs.some((doc) => doc.text)) applyDocs(docs, 'Dokumentlisten er oppdatert.');
    else setPayload((current) => (current ? { ...current, documents: docs } : current));
  }

  async function readPasted() {
    const text = pasted.trim();
    if (text.length < 20) {
      setError('Lim inn avtaleteksten, eller last opp filene.');
      return;
    }
    setReading(true);
    try {
      const docs = [
        ...files.filter((doc) => doc.name !== 'Innlimt tekst'),
        { id: `dok-${Date.now()}`, name: 'Innlimt tekst', text, role: files.length ? 'vedlegg' : 'hoved', interpreted: true },
      ];
      await applyDocs(docs, 'Teksten er lest. Kontroller feltene før du registrerer.');
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke lese teksten.');
    } finally {
      setReading(false);
    }
  }

  function useCustomer(customer, create = false) {
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
      buyer: customer.name,
      orgnr: customer.orgnr,
      personnummer: customer.personnummer,
      address: form.address || customer.address,
      place: form.place || customer.place,
      contactName: form.contactName || customer.contactName,
      email: form.email || customer.email,
      phone: form.phone || customer.phone,
      ownerUid: customer.ownerUid || form.ownerUid || '',
      ownerName: customer.ownerName || form.ownerName || '',
    });
  }

  async function submit() {
    const input = {
      ...form,
      title: form.title.trim(),
      buyer: form.buyer.trim(),
      projectName: form.projectName.trim() || form.title.trim(),
      fields: {
        ...(payload?.fields || {}),
        standard: form.standard,
        indexId: form.indexId,
        honorar: form.honorar,
        place: form.place,
        address: form.address,
        description: form.description,
        poNumber: form.poNumber,
        orgnr: form.orgnr,
        supplierOrgnr: form.supplierOrgnr,
        personnummer: form.personnummer,
        contactName: form.contactName,
        email: form.email,
        phone: form.phone,
        reference: form.oppdragId || form.reference,
        surchargePercent: form.surchargePercent,
        contractDate: form.contractDate,
        projectName: form.projectName.trim() || form.title.trim(),
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
          title: form.title.trim(),
          buyer: form.buyer.trim(),
          startDate: form.start,
          endDate: form.end,
        }
        : indexDraftFromInterpretation(emptyDraft({
          title: form.title.trim(),
          buyer: form.buyer.trim(),
          startDate: form.start,
          endDate: form.end,
        }), form),
    };
    const result = await onRegister(input);
    if (result?.ok) {
      setForm(emptyForm());
      setPayload(null);
      setFiles([]);
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

  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
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
          Last opp avtaledokumentene. Kjente felt fylles ut. Felt med ! må kontrolleres.
        </Text>
      )}
      {reading ? (
        <View style={[styles.banner, { borderColor: colors.brand, backgroundColor: colors.brandSoft || colors.bg }]}>
          <Text style={{ color: colors.brand, fontWeight: '600' }}>{status || 'Leser avtalen…'}</Text>
        </View>
      ) : null}
      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}

      <View style={styles.row}>
        <TouchableOpacity
          onPress={importFile}
          disabled={reading}
          accessibilityRole="button"
          style={[styles.save, { backgroundColor: colors.brand, opacity: reading ? 0.6 : 1 }]}
        >
          <Text style={{ color: '#fff' }}>{reading ? 'Leser…' : files.length ? 'Legg til dokument' : 'Last opp dokument'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} accessibilityRole="button">
          <Text style={{ color: colors.muted }}>Avbryt</Text>
        </TouchableOpacity>
      </View>

      <Drawer colors={colors} title={`Dokumenter (${files.length})`} open={open.dokumenter} onToggle={() => toggle('dokumenter')}>
        {files.length ? files.map((doc) => (
          <View key={doc.id} style={styles.row}>
            <TouchableOpacity
              onPress={() => documentIsOpenable(doc) && openAgreementDocument(doc)}
              accessibilityRole="link"
              style={{ flex: 1 }}
            >
              <Text style={{ color: documentIsOpenable(doc) ? colors.brand : colors.ink, textDecorationLine: documentIsOpenable(doc) ? 'underline' : 'none' }}>
                {doc.name}{doc.interpreted ? ' · lest' : ''}{doc.dataUrl ? '' : doc.size > 700000 ? ' · for stor til lagring' : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => removeFile(doc.id)} accessibilityRole="button">
              <Text style={{ color: colors.muted }}>Fjern</Text>
            </TouchableOpacity>
          </View>
        )) : <Text style={{ color: colors.muted }}>Ingen dokument er lagt ved ennå.</Text>}
        <TextInput
          value={pasted}
          onChangeText={setPasted}
          placeholder="Eller lim inn avtaleteksten her"
          placeholderTextColor={colors.placeholder}
          multiline
          style={[styles.input, styles.inputMulti, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
        />
        {pasted.trim().length >= 20 ? (
          <TouchableOpacity onPress={readPasted} disabled={reading} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Les innlimt tekst</Text>
          </TouchableOpacity>
        ) : null}
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
        Tomt System-ID og Oppdrags-ID settes automatisk. Oppdrags-ID er unik per kunde. Skriv inn verdier fra et annet system ved overføring. Neste: System-ID {previewSystem} · Oppdrags-ID {previewOppdrag}.
      </Text>

      {kindFields.filter((group) => group.id !== 'ramme').map((group) => (
        <Drawer
          key={group.id}
          colors={colors}
          title={group.title}
          open={open[group.id] !== false}
          onToggle={() => toggle(group.id)}
          badge={groupBadge(group.id)}
        >
          <View style={styles.grid}>
            {group.fields.filter((field) => field.key !== 'kind' && field.key !== 'parentId').map((field) => (
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

      <View style={[styles.hint, { borderColor: flags.buyer || flags.orgnr ? (colors.warn || '#d97706') : colors.line, backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Kunde</Text>
        {confirmText ? <Text style={{ color: colors.ink }}>{confirmText}</Text> : null}
        {registerHit?.name && !namesLikelyMatch(form.buyer, registerHit.name) ? (
          <TouchableOpacity onPress={() => patch({ buyer: registerHit.name })} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Bruk navn fra Enhetsregisteret</Text>
          </TouchableOpacity>
        ) : null}
        {customerHint.status === 'match' ? (
          <View style={styles.row}>
            <TouchableOpacity onPress={() => useCustomer(customerHint.customer)} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>{form.customerId === customerHint.customer.id ? 'Koblet i registeret' : 'Koble til eksisterende kunde'}</Text>
            </TouchableOpacity>
            {onOpenCustomer ? (
              <TouchableOpacity onPress={() => onOpenCustomer(customerHint.customer.id)} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Åpne kundeforhold</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {customerHint.status === 'ambiguous' ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.muted }}>Flere kunder kan passe.</Text>
            {customerHint.candidates.map((row) => (
              <TouchableOpacity key={row.id} onPress={() => useCustomer(row)} accessibilityRole="button">
                <Text style={{ color: form.customerId === row.id ? colors.brand : colors.ink }}>{row.name}{row.orgnr ? ` · ${formatOrgnr(row.orgnr)}` : ''}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {customerHint.status === 'new' ? (
          <TouchableOpacity onPress={() => useCustomer(customerHint.draft, true)} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>
              {form.createCustomer ? 'Ny kunde opprettes ved registrering' : 'Opprett som ny kunde ved registrering'}
            </Text>
          </TouchableOpacity>
        ) : null}
        <OwnerPicker
          colors={colors}
          people={followPeople}
          value={form.ownerUid}
          onChange={(person) => patch({
            ownerUid: person ? (person.uid || person.id) : '',
            ownerName: person ? person.name : '',
          })}
        />
      </View>

      {projects.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Koble til prosjekt</Text>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => patch({ projectId: '' })} accessibilityRole="button">
              <Text style={{ color: form.projectId ? colors.muted : colors.brand }}>Ingen</Text>
            </TouchableOpacity>
            {projects.map((project) => (
              <TouchableOpacity key={project.id} onPress={() => patch({ projectId: project.id, projectName: form.projectName || project.name })} accessibilityRole="button">
                <Text style={{ color: form.projectId === project.id ? colors.brand : colors.ink }}>{project.name}</Text>
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
}

const styles = StyleSheet.create({
  h: { fontSize: 20, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 14 },
  save: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hint: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  banner: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  summary: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  drawer: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  drawerHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  drawerBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { borderWidth: 1, borderColor: 'transparent', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
});
