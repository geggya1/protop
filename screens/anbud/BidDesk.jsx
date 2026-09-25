import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { formatWhen, saveSupplierProfile } from '../../src/anbud/model';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';

function Field({ label, value, onChangeText, colors, placeholder, keyboardType }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.muted }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        keyboardType={keyboardType || 'default'}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
    </View>
  );
}

export default function BidDesk({ company, colors, bids, onProfile }) {
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [portal, setPortal] = useState('mercell');
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    loadAnbudState().then((state) => {
      const saved = state.supplierProfile;
      setProfile(saved);
      if (!saved) return;
      setContactName(saved.contactName || '');
      setEmail(saved.email || '');
      setPhone(saved.phone || '');
      setUsername(saved.username || '');
      setPortal(saved.portal || 'mercell');
    });
  }, [company?.id]);

  async function save() {
    const loaded = await loadAnbudState();
    const result = saveSupplierProfile(loaded, {
      companyName: company?.name || '',
      orgnr: company?.orgnr || '',
      contactName,
      email,
      phone,
      username,
      portal,
    });
    if (!result.ok) {
      setError(result.error);
      setNote('');
      return;
    }
    await saveAnbudState(result.state);
    setProfile(result.state.supplierProfile);
    setError('');
    setNote('Profilen er registrert. Interesse meldes med dette brukernavnet, og grunnlaget hentes inn i konkurransen.');
    onProfile?.(result.state.supplierProfile);
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.h, { color: colors.ink }]}>Innloggingsprofil</Text>
      <Text style={{ color: colors.muted }}>
        Profilen er bedriftens bruker hos innleveringsportalen. Når et treff merkes som aktuelt og interesse meldes, brukes denne profilen, og frister, filer og spørsmål hentes inn hit.
      </Text>
      <Field label="Kontaktperson" value={contactName} onChangeText={setContactName} colors={colors} placeholder="Navn" />
      <Field label="E-post" value={email} onChangeText={setEmail} colors={colors} placeholder="anbud@firma.no" keyboardType="email-address" />
      <Field label="Telefon" value={phone} onChangeText={setPhone} colors={colors} placeholder="Telefon" keyboardType="phone-pad" />
      <Text style={{ color: colors.muted }}>Portal</Text>
      <View style={styles.row}>
        {[['mercell', 'Mercell'], ['doffin', 'Doffin']].map(([id, label]) => (
          <TouchableOpacity key={id} onPress={() => setPortal(id)} accessibilityRole="button" style={[styles.chip, { backgroundColor: portal === id ? colors.brand : colors.sunken }]}>
            <Text style={{ color: portal === id ? '#fff' : colors.ink }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Field label="Brukernavn" value={username} onChangeText={setUsername} colors={colors} placeholder="Bruker hos portalen" />
      <TouchableOpacity onPress={save} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
        <Text style={{ color: '#fff' }}>{profile ? 'Oppdater profil' : 'Registrer profil'}</Text>
      </TouchableOpacity>
      {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {profile ? (
        <Text style={{ color: colors.muted }}>
          Registrert som {profile.username} · {profile.email} · {profile.portal === 'doffin' ? 'Doffin' : 'Mercell'}
        </Text>
      ) : null}

      <Text style={[styles.h, { color: colors.ink }]}>Tilbudsarbeid</Text>
      <Text style={{ color: colors.muted }}>Konkurranser det er meldt interesse for. Selve tilbudet kommer i et senere trinn.</Text>
      {bids.map((bid) => <BidCard key={bid.id} bid={bid} colors={colors} />)}
      {!bids.length ? <Text style={{ color: colors.muted }}>Ingen konkurranser er flyttet hit ennå. Registrer profilen, merk et treff som aktuelt og meld interesse.</Text> : null}
    </View>
  );
}

function BidCard({ bid, colors }) {
  const dossier = bid.dossier;
  const interest = bid.interest;
  return (
    <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>{bid.title}</Text>
      <Text style={{ color: colors.ink }}>{bid.buyer || 'Oppdragsgiver ikke oppgitt'}</Text>
      {interest ? (
        <Text style={{ color: colors.ink }}>
          Interesse meldt som {interest.username} {interest.registeredAt ? formatWhen(interest.registeredAt) : ''}
        </Text>
      ) : (
        <Text style={{ color: colors.muted }}>Interesse er ikke registrert på profilen ennå.</Text>
      )}
      {dossier ? <DossierLines dossier={dossier} colors={colors} /> : (
        <Text style={{ color: colors.muted }}>Konkurransegrunnlaget hentes når interessen meldes.</Text>
      )}
    </View>
  );
}

function Line({ label, value, colors }) {
  if (!value) return null;
  return <Text style={{ color: colors.ink }}>{label}: {value}</Text>;
}

function DossierLines({ dossier, colors }) {
  return (
    <View style={{ gap: 4 }}>
      <Line label="Tilbudsfrist" value={dossier.submissionDeadline} colors={colors} />
      <Line label="Frist for spørsmål" value={dossier.questionDeadline} colors={colors} />
      <Line label="Prosedyre" value={dossier.procedure} colors={colors} />
      <Line label="ESPD" value={dossier.espd ? 'Egenerklæring brukes' : ''} colors={colors} />
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Filer</Text>
      {dossier.documents?.length ? dossier.documents.map((doc) => (
        <Text key={doc.url} style={{ color: colors.brand }} onPress={() => Linking.openURL(doc.url)}>{doc.title}</Text>
      )) : <Text style={{ color: colors.muted }}>Ingen filer i kunngjøringen.</Text>}
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Spørsmål og svar</Text>
      {dossier.qa?.length ? dossier.qa.map((row) => (
        <Text key={`${row.question}-${row.answer}`} style={{ color: colors.ink }}>{row.question}: {row.answer}</Text>
      )) : <Text style={{ color: colors.muted }}>Ingen spørsmål og svar er publisert i kunngjøringen ennå.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  save: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
});
