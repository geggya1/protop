/**
 * HMS-kortet på en person: skann QR-koden, ta bilde av kortet eller skriv inn.
 * Brukes av HR (Lovpålagt) og av den ansatte selv (Min side › Gjøremål).
 *
 * Skann lagrer lenken til kortet i HMS-kortregisteret med en gang. Bildet av forsiden leses
 * med AI (kortnummer, gyldig til, navn, fødselsdato og arbeidsgiver) og lagres når det er lest.
 * onSave(kort) lagrer kortet og kan returnere et løfte.
 */
import React, { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { applyHmsCardRead, hmsCardStatus, parseHmsQr } from '../../src/hr/hmsCard';
import { readHmsCardPhoto } from '../../src/hr/hmsCardRead';
import { formatNbDate } from '../../src/hr/model';
import { pickImage } from '../../src/utils/media';
import BarcodeScannerModal from '../../components/BarcodeScannerModal';
import { HrButton, HrChip, HrField } from './HrShared';

const SOURCE_LABEL = { qr: 'Skannet', photo: 'Lest fra bilde', manual: 'Skrevet inn' };

async function bytesOf(file) {
  let blob = file?.blob || null;
  if (!blob && file?.uri && typeof fetch === 'function') blob = await (await fetch(file.uri)).blob();
  if (!blob || typeof blob.arrayBuffer !== 'function') throw new Error('Kunne ikke lese bildet.');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || file?.mimeType || 'image/jpeg' };
}

function sameName(a, b) {
  const clean = (value) => String(value || '').toLowerCase().replace(/[^a-zæøå]/g, '');
  return !clean(a) || !clean(b) || clean(a).includes(clean(b)) || clean(b).includes(clean(a));
}

export default function HmsCardEditor({
  colors, card, canWrite, familyId, onSave, notApplicable = false, onApplicable = null,
  personName = '', personBirthDate = '',
}) {
  const [draft, setDraft] = useState(() => ({
    number: card?.number || '',
    validTo: card?.validTo || '',
    employerOrgnr: card?.employerOrgnr || '',
  }));
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [warn, setWarn] = useState('');
  const state = hmsCardStatus(card);

  async function store(next, message) {
    setBusy(true);
    try {
      await onSave?.(next);
      setNote(message);
    } catch (err) {
      setNote(err?.message || 'Kunne ikke lagre HMS-kortet.');
    } finally {
      setBusy(false);
    }
  }

  async function onScan(raw) {
    setScanning(false);
    const parsed = parseHmsQr(raw);
    if (!parsed.url && !parsed.number) {
      setNote('QR-koden ble ikke gjenkjent som et HMS-kort. Ta bilde av kortet eller skriv inn kortnummer og utløpsdato.');
      return;
    }
    const next = {
      ...(card || {}),
      qrUrl: parsed.url || card?.qrUrl || '',
      qrId: parsed.id || card?.qrId || '',
      number: parsed.number || card?.number || '',
      source: 'qr',
      scannedAt: new Date().toISOString(),
    };
    if (parsed.number) setDraft((prev) => ({ ...prev, number: parsed.number }));
    await store(next, next.validTo && next.number
      ? 'QR-koden er lagret på personen.'
      : 'QR-koden er lagret på personen. Ta bilde av forsiden av kortet, så leses kortnummer og utløpsdato.');
  }

  async function readPhoto() {
    setNote('');
    setWarn('');
    let file;
    try {
      file = await pickImage({ camera: true, edit: false });
    } catch {
      setNote('Fikk ikke tilgang til kameraet.');
      return;
    }
    if (!file) return;
    setBusy(true);
    try {
      const { bytes, mime } = await bytesOf(file);
      const read = await readHmsCardPhoto({ familyId, bytes, mime, filename: file.name || 'hms-kort.jpg' });
      if (!read.number && !read.validTo) {
        setNote('Fant ikke kortnummer eller utløpsdato på bildet. Prøv et skarpere bilde av forsiden, eller skriv inn.');
        return;
      }
      const next = { ...applyHmsCardRead(card || {}, read), source: 'photo', scannedAt: new Date().toISOString() };
      setDraft({ number: next.number || '', validTo: next.validTo || '', employerOrgnr: next.employerOrgnr || '' });
      const mismatch = [];
      if (next.holderName && personName && !sameName(next.holderName, personName)) mismatch.push(`navnet på kortet er ${next.holderName}`);
      if (next.birthDate && personBirthDate && next.birthDate !== personBirthDate) mismatch.push(`fødselsdatoen på kortet er ${formatNbDate(next.birthDate)}`);
      if (mismatch.length) setWarn(`Kontroller kortet: ${mismatch.join(' og ')}.`);
      setBusy(false);
      await store(next, 'Kortet er lest og lagret.');
    } catch (err) {
      setNote(err?.message || 'Kunne ikke lese bildet.');
    } finally {
      setBusy(false);
    }
  }

  const facts = [
    ['Kortnummer', card?.number],
    ['Gyldig til', card?.validTo ? formatNbDate(card.validTo) : ''],
    ['Navn på kortet', card?.holderName],
    ['Fødselsdato', card?.birthDate ? formatNbDate(card.birthDate) : ''],
    ['Arbeidsgiver', [card?.employerName, card?.employerOrgnr].filter(Boolean).join(' · ')],
    [SOURCE_LABEL[card?.source] || 'Registrert', card?.scannedAt ? formatNbDate(card.scannedAt.slice(0, 10)) : ''],
  ].filter(([, value]) => value);

  return (
    <View style={styles.stack} nativeID="hms-card-editor">
      {facts.length && !notApplicable ? (
        <View style={styles.facts} nativeID="hms-card-facts">
          {facts.map(([label, value]) => (
            <View key={label} style={styles.fact}>
              <Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text>
              <Text style={[styles.factValue, { color: colors.ink }]}>{value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {card && state.id === 'missing' && !notApplicable ? (
        <Text style={[styles.line, { color: colors.danger }]} nativeID="hms-card-missing">{`${state.label}.`}</Text>
      ) : null}
      {canWrite && !notApplicable ? (
        <>
          <View style={styles.actions}>
            <HrButton colors={colors} label="Skann QR-koden" icon="qr-code-outline" nativeID="hr-compliance-hms-scan" disabled={busy} onPress={() => { setNote(''); setScanning(true); }} />
            <HrButton colors={colors} label={busy ? 'Leser …' : 'Ta bilde av kortet'} icon="camera-outline" nativeID="hms-card-photo" disabled={busy || !familyId} onPress={readPhoto} />
            {card?.qrUrl ? (
              <HrButton colors={colors} label="Åpne kortet i HMS-kortregisteret" icon="open-outline" onPress={() => Linking.openURL(card.qrUrl).catch(() => {})} />
            ) : null}
          </View>
          {note ? <Text style={[styles.line, { color: colors.brand }]} nativeID="hms-card-note">{note}</Text> : null}
          {warn ? <Text style={[styles.line, { color: colors.danger }]}>{warn}</Text> : null}
          <View style={styles.fields}>
            <View style={styles.field}>
              <HrField colors={colors} label="Kortnummer" value={draft.number} onChangeText={(number) => setDraft((prev) => ({ ...prev, number }))} />
            </View>
            <View style={styles.field}>
              <HrField colors={colors} label="Gyldig til" date="iso" clearable value={draft.validTo} onChangeText={(validTo) => setDraft((prev) => ({ ...prev, validTo }))} />
            </View>
            <View style={styles.field}>
              <HrField colors={colors} label="Arbeidsgivers org.nr. (tomt: bedriftens)" value={draft.employerOrgnr} onChangeText={(employerOrgnr) => setDraft((prev) => ({ ...prev, employerOrgnr }))} keyboardType="number-pad" />
            </View>
          </View>
          <View style={styles.actions}>
            <HrButton
              colors={colors}
              label="Lagre HMS-kort"
              icon="card-outline"
              nativeID="hr-compliance-hms-save"
              disabled={busy}
              onPress={() => store({ ...(card || {}), ...draft, source: card?.source || 'manual' }, 'HMS-kortet er lagret.')}
            />
          </View>
          <BarcodeScannerModal
            visible={scanning}
            qr
            title="Skann HMS-kortet"
            hint="Hold QR-koden på forsiden av kortet i rammen."
            permissionText="Vi trenger kamera for å lese QR-koden på HMS-kortet."
            onScan={onScan}
            onClose={() => setScanning(false)}
          />
        </>
      ) : null}
      {canWrite && onApplicable ? (
        <View style={styles.actions}>
          <HrChip
            colors={colors}
            label={notApplicable ? 'Personen trenger HMS-kort' : 'Ikke aktuelt for denne personen'}
            onPress={() => onApplicable(notApplicable)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: { minWidth: 140, flexGrow: 1, flexBasis: 160, gap: 2 },
  factLabel: { fontSize: 12 },
  factValue: { fontSize: 14, fontWeight: '600' },
  line: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { flexGrow: 1, flexBasis: 200 },
});
