import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { updateGroup } from '../../src/utils/groups';
import { INTAKE_CHANNELS, createManualInquiry } from '../../src/anbud/intake';
import { fileToDataUrl, mergeScan, scanAnbudFile, sendDirectAnbud } from '../../src/anbud/intakeClient';
import { pickImages } from '../../src/utils/media';

function Field({ label, value, onChangeText, placeholder, colors }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        style={{ color: colors.ink, borderColor: colors.line, backgroundColor: colors.card, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 }}
      />
    </View>
  );
}

function filesOf(picked) {
  return (picked || []).map((file) => ({
    name: file.name || file.fileName || 'vedlegg',
    mime: file.mime || file.type || 'image/jpeg',
    size: file.size || file.blob?.size || 0,
    blob: file.blob || null,
    uri: file.uri || '',
  }));
}

export default function IntakePanel({ mode, colors, company }) {
  const { applyFamilyPatch, family } = useApp();
  const [title, setTitle] = useState('');
  const [toOrgnr, setToOrgnr] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState('epost');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const inbox = Array.isArray(family?.anbudInbox) ? family.anbudInbox : (company?.anbudInbox || []);
  const saved = Array.isArray(family?.anbudInquiries) ? family.anbudInquiries : (company?.anbudInquiries || []);

  async function persistManual(inquiry) {
    if (!company?.id) return;
    const next = [inquiry, ...saved].slice(0, 40);
    await updateGroup(company.id, { anbudInquiries: next });
    applyFamilyPatch?.(company.id, { anbudInquiries: next });
  }

  async function onDrop() {
    setError('');
    try {
      const picked = filesOf(await pickImages({ max: 8 }));
      if (!picked.length) return;
      setFiles(picked);
      setBusy(true);
      const first = picked.find((file) => file.blob || file.uri);
      if (!first) return;
      const dataUrl = first.blob ? await fileToDataUrl(first) : '';
      if (!dataUrl) {
        setNote('Vedleggene er lagt til. AI-lesing krever bildefil i nettleseren.');
        return;
      }
      const data = await scanAnbudFile(dataUrl);
      const draft = createManualInquiry({
        channel, title, contactName, email, phone, description: message, ocrStatus: 'done', ocrEngine: data.engine,
      }, picked);
      if (!draft.ok) return;
      const filled = mergeScan(draft.inquiry, data);
      setTitle(filled.title || title);
      setContactName(filled.contactName || contactName);
      setEmail(filled.email || email);
      setPhone(filled.phone || phone);
      setMessage(filled.description || message);
      setNote('Opplysningene er lest fra dokumentet. Se over før du lagrer.');
    } catch (err) {
      setError(err?.message || 'Kunne ikke lese dokumentet.');
    } finally {
      setBusy(false);
    }
  }

  async function saveManual() {
    const made = createManualInquiry({
      channel, title, contactName, email, phone, description: message,
    }, files);
    if (!made.ok) {
      setError(made.error);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await persistManual(made.inquiry);
      setTitle('');
      setContactName('');
      setEmail('');
      setPhone('');
      setMessage('');
      setFiles([]);
      setNote('Henvendelsen er registrert med vedleggene.');
    } catch (err) {
      setError(err?.message || 'Kunne ikke lagre henvendelsen.');
    } finally {
      setBusy(false);
    }
  }

  async function sendDirect() {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const data = await sendDirectAnbud({
        title,
        toOrgnr,
        fromCompanyId: company?.id || '',
        fromName: company?.name || '',
        contactName,
        email,
        phone,
        message,
      });
      setNote(`Forespørselen er sendt til ${data.companyName || 'bedriften'}.`);
      setTitle('');
      setMessage('');
    } catch (err) {
      setError(err?.message || 'Kunne ikke sende forespørselen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      {error ? <Text style={{ color: colors.danger, fontWeight: '700' }}>{error}</Text> : null}
      {note ? <Text style={{ color: colors.muted }}>{note}</Text> : null}
      {mode === 'protop' ? (
        <>
          <Text style={{ color: colors.muted }}>
            Send en anbudsforespørsel direkte til en annen bedrift i ProTop. De får den i innboksen sin.
          </Text>
          <Field label="Mottakers organisasjonsnummer" value={toOrgnr} onChangeText={setToOrgnr} placeholder="9 siffer" colors={colors} />
          <Field label="Forespørsel" value={title} onChangeText={setTitle} placeholder="Hva skal prises" colors={colors} />
          <Field label="Melding" value={message} onChangeText={setMessage} placeholder="Kort beskrivelse" colors={colors} />
          <Field label="Kontakt" value={contactName} onChangeText={setContactName} placeholder="Navn" colors={colors} />
          <Field label="E-post" value={email} onChangeText={setEmail} placeholder="navn@firma.no" colors={colors} />
          <Field label="Telefon" value={phone} onChangeText={setPhone} placeholder="Telefon" colors={colors} />
          <TouchableOpacity onPress={sendDirect} disabled={busy} style={{ backgroundColor: colors.brand, borderRadius: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Sender …' : 'Send forespørsel'}</Text>
          </TouchableOpacity>
          {inbox.length ? inbox.slice(0, 8).map((row) => (
            <View key={row.id} style={{ borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: 14, padding: 12, gap: 4 }}>
              <Text style={{ color: colors.ink, fontWeight: '800' }}>{row.title}</Text>
              <Text style={{ color: colors.muted }}>{row.fromName || 'En ProTop-bedrift'} · {row.status || 'mottatt'}</Text>
            </View>
          )) : <Text style={{ color: colors.muted }}>Ingen forespørsler fra andre bedrifter ennå.</Text>}
        </>
      ) : (
        <>
          <Text style={{ color: colors.muted }}>
            Registrer henvendelsen manuelt. Slipp brev, e-post eller bilder her, så leser AI og OCR feltene og legger ved filene.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {INTAKE_CHANNELS.map((row) => (
              <TouchableOpacity key={row.id} onPress={() => setChannel(row.id)} style={{ backgroundColor: channel === row.id ? colors.brand : colors.sunken, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ color: channel === row.id ? '#fff' : colors.ink, fontWeight: '700' }}>{row.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={onDrop} disabled={busy} style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.brand, borderRadius: 16, padding: 18, backgroundColor: colors.card }}>
            <Text style={{ color: colors.brand, fontWeight: '800' }}>{busy ? 'Leser dokumentet …' : 'Slipp eller velg dokumenter og bilder'}</Text>
            <Text style={{ color: colors.muted, marginTop: 4 }}>{files.length ? files.map((file) => file.name).join(', ') : 'Brev, e-post, foto'}</Text>
          </TouchableOpacity>
          <Field label="Tittel" value={title} onChangeText={setTitle} placeholder="Fylles ut fra dokumentet" colors={colors} />
          <Field label="Kontakt" value={contactName} onChangeText={setContactName} placeholder="Navn" colors={colors} />
          <Field label="E-post" value={email} onChangeText={setEmail} placeholder="E-post" colors={colors} />
          <Field label="Telefon" value={phone} onChangeText={setPhone} placeholder="Telefon" colors={colors} />
          <Field label="Henvendelse" value={message} onChangeText={setMessage} placeholder="Det som ble lest, eller det du skriver selv" colors={colors} />
          <TouchableOpacity onPress={saveManual} disabled={busy} style={{ backgroundColor: colors.brand, borderRadius: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Lagrer …' : 'Registrer forespørsel'}</Text>
          </TouchableOpacity>
          {saved.slice(0, 8).map((row) => (
            <View key={row.id} style={{ borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: 14, padding: 12, gap: 4 }}>
              <Text style={{ color: colors.ink, fontWeight: '800' }}>{row.title}</Text>
              <Text style={{ color: colors.muted }}>
                {[INTAKE_CHANNELS.find((item) => item.id === row.channel)?.label, row.contactName, row.email, row.phone].filter(Boolean).join(' · ')}
              </Text>
              {row.attachments?.length ? <Text style={{ color: colors.muted }}>{row.attachments.length} vedlegg</Text> : null}
            </View>
          ))}
        </>
      )}
    </View>
  );
}
