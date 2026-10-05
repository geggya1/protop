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
import { formatOrgnr, matchCustomer, customerDraftFromBrreg, normalizeOrgnr } from '../../src/anbud/customers';
import { searchBrregCompanies } from '../../src/utils/boligmappaApis';
import { pickDocument } from '../../src/utils/media';

const ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';
const MAX_REMOTE_BYTES = 2500000;

function yieldUi() {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

const MULTILINE = new Set(['description', 'honorar']);

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
    standard: input.standard || input.fields?.standard || '',
    indexId: input.indexId || input.fields?.indexId || '',
    surchargePercent: input.surchargePercent || input.fields?.surchargePercent || '',
    contractDate: input.contractDate || input.fields?.contractDate || '',
  };
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

function engineLabel(used) {
  if (used === 'ocr+gemini' || used === 'gemini') return 'OCR + KI';
  if (used === 'ocr') return 'OCR';
  return 'lokal lesing';
}

function Field({ colors, field, value, onChange }) {
  return (
    <View style={{ gap: 4, flexGrow: 1, flexBasis: MULTILINE.has(field.key) ? '100%' : 220, minWidth: 180 }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{field.label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder=""
        placeholderTextColor={colors.placeholder}
        multiline={MULTILINE.has(field.key)}
        style={[
          styles.input,
          MULTILINE.has(field.key) && styles.inputMulti,
          { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg },
        ]}
      />
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
  onCancel,
  onRegister,
  onOpenCustomer,
}) {
  const [form, setForm] = useState(() => ({ ...emptyForm(), parentId, kind, customerId }));
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);
  const [engine, setEngine] = useState('');
  const [pasted, setPasted] = useState('');
  const [files, setFiles] = useState([]);
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
    }));
  }, [customerId, customers]);

  const orgnrDigits = normalizeOrgnr(form.orgnr) || String(form.orgnr || '').replace(/\D/g, '').slice(0, 9);
  useEffect(() => {
    if (orgnrDigits.length !== 9 || brregRef.current === orgnrDigits) return undefined;
    let live = true;
    searchBrregCompanies(orgnrDigits, { size: 1 }).then((res) => {
      if (!live) return;
      brregRef.current = orgnrDigits;
      const draft = customerDraftFromBrreg(res.results?.[0]);
      if (!draft) return;
      setForm((current) => ({
        ...current,
        buyer: current.buyer || draft.name,
        orgnr: draft.orgnr || current.orgnr,
        personnummer: '',
        address: current.address || draft.address,
        place: current.place || draft.place,
        email: current.email || draft.email,
        phone: current.phone || draft.phone,
      }));
    }).catch(() => {
      if (live) brregRef.current = orgnrDigits;
    });
    return () => { live = false; };
  }, [orgnrDigits]);

  const findings = payload?.fields?.findings || [];
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
  const parents = parentOptions(contracts);

  function patch(part) {
    setForm((current) => ({ ...current, ...part }));
  }

  async function applyDocs(docs, note) {
    const local = interpretDocuments(docs.filter((doc) => String(doc?.text || '').trim().length >= 20));
    let merged = local;
    let used = local.engine || 'lokal';
    try {
      const remote = await interpretAvtale({ documents: docs });
      if (remote?.extracted) {
        merged = mergeInterpretation(local, remote.extracted, docs.map((doc) => doc.text).filter(Boolean).join('\n'));
        used = remote.engine || merged.engine || 'gemini';
      }
    } catch {
      used = 'lokal';
    }
    const next = inputFromInterpretation(merged, { documents: docs });
    setPayload(next);
    setFiles(docs);
    setForm((current) => formFromInput(next, current));
    setEngine(used);
    setStatus(note);
    setError('');
  }

  async function applyRemote(file, bytes, existing, note) {
    const remote = await interpretAvtale({
      fileName: file.name || 'Avtale.pdf',
      mimeType: file.mimeType || 'application/pdf',
      fileBase64: bytesToBase64(bytes),
    });
    if (!remote?.extracted) throw new Error('Kunne ikke lese PDF-en. Lim inn teksten under.');
    const text = String(remote.text || '').trim();
    const docs = [
      ...existing,
      {
        id: `dok-${Date.now()}`,
        name: file.name || 'Avtale',
        text,
        role: existing.length ? 'vedlegg' : 'hoved',
        mimeType: file.mimeType || 'application/pdf',
        interpreted: text.length >= 20,
      },
    ];
    const merged = mergeInterpretation(null, remote.extracted, text);
    const next = inputFromInterpretation(merged, { documents: docs });
    setPayload(next);
    setFiles(docs);
    setForm((current) => formFromInput(next, current));
    setEngine(remote.engine || 'ocr+gemini');
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
      let bytes = await bytesFromFile(file);
      const pdf = /\.pdf$/i.test(file.name || '') || /pdf/i.test(file.mimeType || '');
      const sendRemote = async (note) => {
        if (bytes.length > MAX_REMOTE_BYTES) {
          setStatus('Filen er stor. Leser starten med OCR og KI…');
          await yieldUi();
          bytes = bytes.subarray(0, MAX_REMOTE_BYTES);
        }
        await applyRemote(file, bytes, files, note);
      };
      if (pdf && bytes.length > MAX_LOCAL_PDF_BYTES) {
        await sendRemote(`${file.name || 'Filen'} er lest med OCR og KI. Kontroller feltene før du registrerer.`);
        return;
      }
      try {
        const text = await extractContractText(bytes, file.name, file.mimeType);
        const docs = [
          ...files,
          {
            id: `dok-${Date.now()}`,
            name: file.name || 'Avtale',
            text,
            role: files.length ? 'vedlegg' : 'hoved',
            mimeType: file.mimeType || '',
            interpreted: true,
          },
        ];
        await applyDocs(docs, `${docs.length} dokument${docs.length === 1 ? '' : 'er'} vedlagt. Kontroller feltene før du registrerer.`);
      } catch {
        setStatus('Leser skannet dokument med OCR og KI…');
        await yieldUi();
        await sendRemote(`${file.name || 'Filen'} er lagt ved. Kontroller feltene før du registrerer.`);
      }
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke lese dokumentet. Lim inn teksten under.');
    } finally {
      setReading(false);
    }
  }

  function addEmptyFile() {
    const name = `Vedlegg ${files.length + 1}`;
    setFiles((current) => [...current, {
      id: `dok-${Date.now()}`,
      name,
      text: '',
      role: current.length ? 'vedlegg' : 'hoved',
      interpreted: false,
    }]);
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
        reference: form.reference,
        surchargePercent: form.surchargePercent,
        contractDate: form.contractDate,
        projectName: form.projectName.trim() || form.title.trim(),
      },
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

  return (
    <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card }]}>
      <Text style={[styles.h, { color: colors.ink }]}>Registrer avtale</Text>
      <Text style={{ color: colors.muted }}>
        Last opp alle avtaledokumentene. Kjente felt fra NS 8403-fremsiden fylles ut. Ukjente felt blir stående tomme.
      </Text>
      {reading ? (
        <View style={[styles.banner, { borderColor: colors.brand, backgroundColor: colors.brandSoft || colors.bg }]}>
          <Text style={{ color: colors.brand, fontWeight: '600' }}>{status || 'Leser avtalen…'}</Text>
        </View>
      ) : null}
      <View style={styles.row}>
        <TouchableOpacity
          onPress={importFile}
          disabled={reading}
          accessibilityRole="button"
          style={[styles.save, { backgroundColor: colors.brand, opacity: reading ? 0.6 : 1 }]}
        >
          <Text style={{ color: '#fff' }}>{reading ? 'Leser…' : files.length ? 'Legg til dokument' : 'Last opp dokument'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={addEmptyFile} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Tomt vedlegg</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} accessibilityRole="button">
          <Text style={{ color: colors.muted }}>Avbryt</Text>
        </TouchableOpacity>
      </View>
      {files.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Dokumenter ({files.length})</Text>
          {files.map((doc) => (
            <View key={doc.id} style={styles.row}>
              <Text style={{ color: colors.ink, flex: 1 }}>{doc.name}{doc.interpreted ? ' · lest' : ''}</Text>
              <TouchableOpacity onPress={() => removeFile(doc.id)} accessibilityRole="button">
                <Text style={{ color: colors.muted }}>Fjern</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
      <TextInput
        value={pasted}
        onChangeText={setPasted}
        placeholder="Eller lim inn avtaleteksten her"
        placeholderTextColor={colors.placeholder}
        multiline
        style={[styles.input, styles.inputMulti, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
      />
      {pasted.trim().length >= 20 ? (
        <TouchableOpacity onPress={readPasted} disabled={reading} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Les innlimt tekst</Text>
        </TouchableOpacity>
      ) : null}
      {!!status && <Text style={{ color: colors.brand }}>{status}{engine ? ` · ${engineLabel(engine)}` : ''}</Text>}
      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}

      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Avtaletype</Text>
        <View style={styles.row}>
          {AGREEMENT_KINDS.map((row) => (
            <TouchableOpacity key={row.id} onPress={() => patch({ kind: row.id })} accessibilityRole="button">
              <Text style={{ color: form.kind === row.id ? colors.brand : colors.ink }}>{row.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {kindFields.filter((group) => group.id !== 'ramme').map((group) => (
        <View key={group.id} style={{ gap: 8 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{group.title}</Text>
          <View style={styles.grid}>
            {group.fields.filter((field) => field.key !== 'kind' && field.key !== 'parentId').map((field) => (
              <Field
                key={field.key}
                colors={colors}
                field={field}
                value={form[field.key] || ''}
                onChange={(value) => patch({ [field.key]: value })}
              />
            ))}
          </View>
        </View>
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

      <View style={[styles.hint, { borderColor: colors.line, backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>Kunde</Text>
        {customerHint.status === 'match' ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.ink }}>
              Treffer {customerHint.customer.name}
              {customerHint.customer.orgnr ? ` · ${formatOrgnr(customerHint.customer.orgnr)}` : ''}
            </Text>
            <View style={styles.row}>
              <TouchableOpacity onPress={() => useCustomer(customerHint.customer)} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>{form.customerId === customerHint.customer.id ? 'Koblet' : 'Koble til kunden'}</Text>
              </TouchableOpacity>
              {onOpenCustomer ? (
                <TouchableOpacity onPress={() => onOpenCustomer(customerHint.customer.id)} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>Åpne kundeforhold</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
        {customerHint.status === 'ambiguous' ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.muted }}>Flere kunder kan passe. Velg en, eller opprett ny.</Text>
            {customerHint.candidates.map((row) => (
              <TouchableOpacity key={row.id} onPress={() => useCustomer(row)} accessibilityRole="button">
                <Text style={{ color: form.customerId === row.id ? colors.brand : colors.ink }}>{row.name}{row.orgnr ? ` · ${formatOrgnr(row.orgnr)}` : ''}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {customerHint.status === 'new' ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.ink }}>
              {form.buyer || 'Oppdragsgiver'} finnes ikke i kunderegisteret.
              {form.orgnr ? ` Org.nr ${formatOrgnr(form.orgnr)}.` : ''}
              {form.personnummer ? ' Personnummer er lest inn.' : ''}
            </Text>
            <TouchableOpacity onPress={() => useCustomer(customerHint.draft, true)} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>
                {form.createCustomer ? 'Ny kunde opprettes ved registrering' : 'Foreslå ny kunde'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {customerHint.status === 'none' ? (
          <Text style={{ color: colors.muted }}>Fyll inn oppdragsgiver. Nye kunder foreslås når navn eller nummer er lest.</Text>
        ) : null}
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

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>Varighet og fornyelse</Text>
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
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>Opsjoner</Text>
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
      </View>

      {findings.length ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>KI-gjennomgang</Text>
          {findings.map((row, index) => (
            <Text key={`${index}-${row.slice(0, 40)}`} style={{ color: colors.muted }}>{row}</Text>
          ))}
        </View>
      ) : null}
      <TouchableOpacity onPress={submit} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
        <Text style={{ color: '#fff' }}>Registrer avtale</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  save: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hint: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  banner: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
