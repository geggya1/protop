import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { interpretAvtale } from '../../src/indeksregulering/aiClient';
import { extractContractText } from '../../src/indeksregulering/extractText';
import { emptyDraft } from '../../src/indeksregulering/engine';
import { interpretDocuments, mergeInterpretation } from '../../src/indeksregulering/interpret';
import { indexDraftFromInterpretation, inputFromInterpretation } from '../../src/anbud/directContract';
import { pickDocument } from '../../src/utils/media';

const ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

const FIELDS = [
  ['title', 'Avtale / oppdrag'],
  ['projectName', 'Prosjekt'],
  ['buyer', 'Kunde / oppdragsgiver'],
  ['value', 'Honorar / kontraktssum'],
  ['start', 'Oppstart (ÅÅÅÅ-MM-DD)'],
  ['end', 'Sluttdato (ÅÅÅÅ-MM-DD)'],
];

function emptyForm() {
  return {
    title: '',
    projectName: '',
    buyer: '',
    value: '',
    start: '',
    end: '',
    projectId: '',
  };
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
  return new Uint8Array(await blob.arrayBuffer());
}

function formFromInput(input) {
  return {
    title: input.title || '',
    projectName: input.projectName || '',
    buyer: input.buyer || '',
    value: input.value == null || input.value === '' ? '' : String(input.value),
    start: input.start || '',
    end: input.end || '',
    projectId: input.projectId || '',
  };
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

export default function DirectAgreementForm({
  colors,
  projects = [],
  onCancel,
  onRegister,
}) {
  const [form, setForm] = useState(emptyForm);
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);
  const [engine, setEngine] = useState('');
  const [pasted, setPasted] = useState('');

  const findings = payload?.fields?.findings || [];
  const extra = useMemo(() => {
    const fields = payload?.fields || {};
    return [
      ['Standard', fields.standard],
      ['Indeks', fields.indexId],
      ['Kontraktsdato', fields.contractDate],
      ['Kontakt', fields.contactName],
      ['Org.nr', fields.orgnr],
      ['Sted', fields.place],
      ['Honorar', fields.honorar],
    ].filter((row) => row[1]);
  }, [payload]);

  function patch(part) {
    setForm((current) => ({ ...current, ...part }));
  }

  async function applyDocs(docs, note) {
    const local = interpretDocuments(docs);
    let merged = local;
    let used = local.engine || 'lokal';
    try {
      const remote = await interpretAvtale({ documents: docs });
      if (remote?.extracted) {
        merged = mergeInterpretation(local, remote.extracted, docs.map((doc) => doc.text).join('\n'));
        used = remote.engine || merged.engine || 'gemini';
      }
    } catch {
      used = 'lokal';
    }
    const next = inputFromInterpretation(merged, { documents: docs });
    setPayload(next);
    setForm((current) => ({ ...formFromInput(next), projectId: current.projectId }));
    setEngine(used);
    setStatus(note);
    setError('');
  }

  async function applyRemoteFile(file, bytes, note) {
    const remote = await interpretAvtale({
      fileName: file.name || 'Avtale.pdf',
      mimeType: file.mimeType || 'application/pdf',
      fileBase64: bytesToBase64(bytes),
    });
    if (!remote?.extracted) throw new Error('KI kunne ikke lese filen. Lim inn teksten, eller bruk en tekstbasert PDF.');
    const merged = mergeInterpretation(null, remote.extracted, '');
    const next = inputFromInterpretation(merged, {
      documents: [{ id: `dok-${Date.now()}`, name: file.name || 'Avtale', text: '' }],
    });
    setPayload(next);
    setForm((current) => ({ ...formFromInput(next), projectId: current.projectId }));
    setEngine(remote.engine || 'gemini');
    setStatus(note);
    setError('');
  }

  async function importFile() {
    setError('');
    const file = await pickDocument({ accept: ACCEPT });
    if (!file) return;
    setReading(true);
    setStatus('Leser avtalen…');
    try {
      const bytes = await bytesFromFile(file);
      try {
        const text = await extractContractText(bytes, file.name, file.mimeType);
        const docs = [
          ...((payload?.documents || []).filter((doc) => doc.text)),
          { id: `dok-${Date.now()}`, name: file.name || 'Avtale', text },
        ];
        await applyDocs(docs, `${file.name || 'Filen'} er lest. Kontroller feltene før du registrerer.`);
      } catch (localError) {
        try {
          await applyRemoteFile(file, bytes, `${file.name || 'Filen'} er sendt til KI. Kontroller feltene før du registrerer.`);
        } catch (remoteError) {
          const remote = String(remoteError?.message || '');
          if (/cors|access-control|failed to fetch|internal/i.test(remote)) {
            throw new Error('Kunne ikke lese PDF-en lokalt, og KI-tjenesten svarte ikke. Lim inn teksten under.');
          }
          throw localError;
        }
      }
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke lese avtalen. Lim inn teksten under.');
    } finally {
      setReading(false);
    }
  }

  async function readPasted() {
    const text = pasted.trim();
    if (text.length < 20) {
      setError('Lim inn avtaleteksten, eller importer filen.');
      return;
    }
    setReading(true);
    try {
      const docs = [
        ...((payload?.documents || []).filter((doc) => doc.text && doc.name !== 'Innlimt tekst')),
        { id: `dok-${Date.now()}`, name: 'Innlimt tekst', text },
      ];
      await applyDocs(docs, 'Teksten er lest. Kontroller feltene før du registrerer.');
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke lese teksten.');
    } finally {
      setReading(false);
    }
  }

  async function submit() {
    const input = {
      title: form.title.trim(),
      buyer: form.buyer.trim(),
      projectName: form.projectName.trim() || form.title.trim(),
      value: form.value,
      start: form.start,
      end: form.end,
      projectId: form.projectId,
      fields: payload?.fields || null,
      documents: payload?.documents || [],
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
      setStatus('');
    }
  }

  return (
    <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card }]}>
      <Text style={[styles.h, { color: colors.ink }]}>Ny avtale</Text>
      <Text style={{ color: colors.muted }}>
        Registrer avtalen direkte, eller importer PDF/Word. KI leser dokumentet og fyller feltene som brukes senere i indeksarbeidet.
      </Text>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={importFile}
          disabled={reading}
          accessibilityRole="button"
          style={[styles.save, { backgroundColor: colors.brand, opacity: reading ? 0.6 : 1 }]}
        >
          <Text style={{ color: '#fff' }}>{reading ? 'Leser…' : 'Importer avtale'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} accessibilityRole="button">
          <Text style={{ color: colors.muted }}>Avbryt</Text>
        </TouchableOpacity>
      </View>
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
      {!!status && <Text style={{ color: colors.brand }}>{status}{engine ? ` · ${engine === 'gemini' ? 'KI' : 'lokal lesing'}` : ''}</Text>}
      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
      {FIELDS.map(([key, label]) => (
        <View key={key} style={{ gap: 4 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
          <TextInput
            value={form[key]}
            onChangeText={(value) => patch({ [key]: value })}
            placeholder={label}
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
        </View>
      ))}
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
      {extra.length ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Uttrukne felt</Text>
          {extra.map(([label, value]) => (
            <Text key={label} style={{ color: colors.ink }}>{label}: {value}</Text>
          ))}
        </View>
      ) : null}
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
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  save: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
});
