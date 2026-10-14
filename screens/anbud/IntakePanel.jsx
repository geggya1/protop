import React, { useState } from 'react';
import { Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { updateGroup } from '../../src/utils/groups';
import { INTAKE_CHANNELS, createManualInquiry, inquiryStatusLabel } from '../../src/anbud/intake';
import { ANBUD_INTAKE_ACCEPT, fileToDataUrl, mergeScan, scanAnbudFile } from '../../src/anbud/intakeClient';
import { pickDocument } from '../../src/utils/media';
import { showSaveToast } from '../../src/ui/saveToast';

function Field({ label, value, onChangeText, placeholder, colors }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '400' }}>{label}</Text>
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
    mime: file.mime || file.mimeType || file.type || 'application/octet-stream',
    size: file.size || file.blob?.size || 0,
    blob: file.blob || null,
    uri: file.uri || '',
  }));
}

export default function IntakePanel({ colors, company }) {
  const { applyFamilyPatch, family } = useApp();
  const [title, setTitle] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState('epost');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const inbox = Array.isArray(family?.anbudInbox) ? family.anbudInbox : (company?.anbudInbox || []);
  const saved = Array.isArray(family?.anbudInquiries) ? family.anbudInquiries : (company?.anbudInquiries || []);

  async function persistManual(inquiry) {
    if (!company?.id) return;
    const next = [inquiry, ...saved].slice(0, 40);
    await updateGroup(company.id, { anbudInquiries: next });
    applyFamilyPatch?.(company.id, { anbudInquiries: next });
  }

  async function readFiles(picked) {
    const list = filesOf(picked);
    if (!list.length) return;
    setFiles(list);
    setBusy(true);
    setError('');
    setNote('');
    try {
      const first = list.find((file) => file.blob || file.uri);
      if (!first) return;
      const dataUrl = await fileToDataUrl(first);
      if (!dataUrl) {
        setNote('Vedleggene er lagt til. Fyll inn feltene manuelt, eller prøv en annen fil.');
        return;
      }
      const data = await scanAnbudFile(dataUrl, first.name, first.mime);
      const filled = mergeScan({
        title, contactName, email, phone, description: message, buyer: '',
      }, data);
      setTitle(filled.title || '');
      setContactName(filled.contactName || '');
      setEmail(filled.email || '');
      setPhone(filled.phone || '');
      setMessage(filled.description || '');
      setNote('Opplysningene er lest der det lot seg gjøre. Se over før du lagrer. Tomme felt lot seg ikke avklare.');
    } catch (err) {
      setError(err?.message || 'Kunne ikke lese dokumentet.');
    } finally {
      setBusy(false);
    }
  }

  async function onPick() {
    setError('');
    try {
      const picked = await pickDocument({ multiple: true, accept: ANBUD_INTAKE_ACCEPT });
      const list = Array.isArray(picked) ? picked : (picked ? [picked] : []);
      await readFiles(list.slice(0, 8));
    } catch (err) {
      setError(err?.message || 'Kunne ikke åpne filvelgeren.');
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
      showSaveToast('Henvendelsen er registrert.');
    } catch (err) {
      setError(err?.message || 'Kunne ikke lagre henvendelsen.');
    } finally {
      setBusy(false);
    }
  }

  const webHandlers = Platform.OS === 'web' ? {
    onDragEnter: (event) => {
      event.preventDefault?.();
      setDragOver(true);
    },
    onDragOver: (event) => {
      event.preventDefault?.();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (event) => {
      event.preventDefault?.();
      setDragOver(false);
      const list = Array.from(event?.dataTransfer?.files || []).map((file) => ({
        name: file.name,
        mimeType: file.type,
        size: file.size,
        blob: file,
      }));
      if (list.length) readFiles(list.slice(0, 8));
    },
  } : {};

  return (
    <View style={{ gap: 10 }}>
      {error ? <Text style={{ color: colors.danger, fontWeight: '400' }}>{error}</Text> : null}
      {note ? <Text style={{ color: colors.muted }}>{note}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {INTAKE_CHANNELS.map((row) => (
          <TouchableOpacity key={row.id} onPress={() => setChannel(row.id)} style={{ backgroundColor: channel === row.id ? colors.brand : colors.sunken, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ color: channel === row.id ? '#fff' : colors.ink, fontWeight: '400' }}>{row.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View
        {...webHandlers}
        style={{
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: dragOver ? colors.brand : colors.brand,
          borderRadius: 16,
          padding: 18,
          backgroundColor: dragOver ? colors.sunken : colors.card,
          gap: 8,
        }}
      >
        <Text style={{ color: colors.brand, fontWeight: '400' }}>
          {busy ? 'Leser dokumentet …' : 'Slipp eller velg dokumenter og bilder'}
        </Text>
        <Text style={{ color: colors.muted }}>
          {files.length
            ? files.map((file) => file.name).join(', ')
            : 'E-post (.msg/.eml), PDF, Word, bilde eller tekst — alle format'}
        </Text>
        <TouchableOpacity onPress={onPick} disabled={busy} style={{ alignSelf: 'flex-start', backgroundColor: colors.brand, borderRadius: 12, minHeight: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.7 : 1 }}>
          <Text style={{ color: '#fff', fontWeight: '400' }}>Velg filer</Text>
        </TouchableOpacity>
      </View>
      <Field label="Tittel" value={title} onChangeText={setTitle} placeholder="Fylles ut fra dokumentet" colors={colors} />
      <Field label="Kontakt" value={contactName} onChangeText={setContactName} placeholder="Navn" colors={colors} />
      <Field label="E-post" value={email} onChangeText={setEmail} placeholder="E-post" colors={colors} />
      <Field label="Telefon" value={phone} onChangeText={setPhone} placeholder="Telefon" colors={colors} />
      <Field label="Henvendelse" value={message} onChangeText={setMessage} placeholder="Det som ble lest, eller det du skriver selv" colors={colors} />
      <TouchableOpacity onPress={saveManual} disabled={busy} style={{ alignSelf: 'flex-start', backgroundColor: colors.brand, borderRadius: 12, minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '400' }}>{busy ? 'Lagrer …' : 'Registrer forespørsel'}</Text>
      </TouchableOpacity>
      {inbox.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.ink, fontWeight: '400' }}>Mottatt i ProTop</Text>
          {inbox.slice(0, 8).map((row) => (
            <View key={row.id} style={{ borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: 14, padding: 12, gap: 4 }}>
              <Text style={{ color: colors.ink, fontWeight: '400' }}>{row.title}</Text>
              <Text style={{ color: colors.muted }}>{row.fromName || 'En ProTop-bedrift'} · {inquiryStatusLabel(row.status)}</Text>
              {row.status === 'ikke' && row.reviewNotes?.length ? (
                <Text style={{ color: colors.ink }}>Hvorfor ikke gi tilbud: {row.reviewNotes.map((note) => note.text).join(' · ')}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {saved.slice(0, 8).map((row) => (
        <View key={row.id} style={{ borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: 14, padding: 12, gap: 4 }}>
          <Text style={{ color: colors.ink, fontWeight: '400' }}>{row.title}</Text>
          <Text style={{ color: colors.muted }}>
            {[inquiryStatusLabel(row.status), INTAKE_CHANNELS.find((item) => item.id === row.channel)?.label, row.contactName, row.email, row.phone].filter(Boolean).join(' · ')}
          </Text>
          {row.status === 'ikke' && row.reviewNotes?.length ? (
            <Text style={{ color: colors.ink }}>Hvorfor ikke gi tilbud: {row.reviewNotes.map((note) => note.text).join(' · ')}</Text>
          ) : null}
          {row.attachments?.length ? <Text style={{ color: colors.muted }}>{row.attachments.length} vedlegg</Text> : null}
        </View>
      ))}
    </View>
  );
}
