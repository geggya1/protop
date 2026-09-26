import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LOGIN_PORTALS, portalFromUrl, saveSupplierProfile, workCandidates } from '../../src/anbud/model';
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

export default function PortalSettings({ company, colors, onOpenWork }) {
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [portalUrl, setPortalUrl] = useState(LOGIN_PORTALS[0].url);
  const [portalName, setPortalName] = useState(LOGIN_PORTALS[0].name);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    loadAnbudState().then((state) => {
      const saved = state.supplierProfile;
      setProfile(saved);
      setWaiting(workCandidates(state).length);
      if (!saved) return;
      setContactName(saved.contactName || '');
      setEmail(saved.email || '');
      setPhone(saved.phone || '');
      setUsername(saved.username || '');
      setPortalUrl(saved.portalUrl || LOGIN_PORTALS[0].url);
      setPortalName(saved.portal || LOGIN_PORTALS[0].name);
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
      portal: portalName,
      portalUrl,
    });
    if (!result.ok) {
      setError(result.error);
      setNote('');
      return;
    }
    await saveAnbudState(result.state);
    setProfile(result.state.supplierProfile);
    setError('');
    const ready = workCandidates(result.state).length;
    setWaiting(ready);
    setNote(ready
      ? `Profilen er lagret. ${ready} treff ligger klare og kan hentes inn nå.`
      : 'Profilen er lagret. Hent treff i anbudsvarslingen, og ta dem inn i tilbudsarbeidet.');
    if (ready) onOpenWork?.();
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.h, { color: colors.ink }]}>Innloggingsportal</Text>
      <Text style={{ color: colors.ink }}>
        Doffin-kunngjøringen, fristene og fillisten leses inn i ProTop. Selve filene ligger hos innleveringsportalen og åpnes når bedriften har meldt interesse der.
      </Text>
      <Text style={{ color: colors.muted }}>
        ProTop lagrer ikke passord og logger ikke inn på Doffin, Mercell, EU Supply eller TendSign. Knappen i tilbudsarbeidet åpner innloggingen på akkurat den konkurransen, slik at interesse og filer gjøres der portalen krever det.
      </Text>
      <Field label="Kontaktperson" value={contactName} onChangeText={setContactName} colors={colors} placeholder="Navn" />
      <Field label="E-post" value={email} onChangeText={setEmail} colors={colors} placeholder="anbud@firma.no" keyboardType="email-address" />
      <Field label="Telefon" value={phone} onChangeText={setPhone} colors={colors} placeholder="Telefon" keyboardType="phone-pad" />
      <Text style={{ color: colors.muted }}>Innloggingsportal</Text>
      <View style={styles.row}>
        {LOGIN_PORTALS.map((item) => {
          const on = portalFromUrl(portalUrl).name === item.name;
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => { setPortalUrl(item.url); setPortalName(item.name); }}
              accessibilityRole="button"
              style={[styles.chip, { backgroundColor: on ? colors.brand : colors.sunken }]}
            >
              <Text style={{ color: on ? '#fff' : colors.ink }}>{item.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Field label="Adresse til innloggingen" value={portalUrl} onChangeText={(value) => { setPortalUrl(value); setPortalName(portalFromUrl(value).name); }} colors={colors} placeholder="https://app.mercell.com/auth/login?bidding" keyboardType="url" />
      {portalFromUrl(portalUrl).url ? (
        <Text style={{ color: colors.brand }} onPress={() => Linking.openURL(portalFromUrl(portalUrl).url)}>Åpne {portalName || 'portalen'}</Text>
      ) : null}
      <Field label="Brukernavn" value={username} onChangeText={setUsername} colors={colors} placeholder="Bruker hos portalen" />
      <TouchableOpacity onPress={save} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
        <Text style={{ color: '#fff' }}>{profile ? 'Oppdater profil' : 'Registrer profil'}</Text>
      </TouchableOpacity>
      {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {profile && waiting ? (
        <TouchableOpacity onPress={onOpenWork} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
          <Text style={{ color: '#fff' }}>Hent {waiting} treff inn i tilbudsarbeidet</Text>
        </TouchableOpacity>
      ) : null}
      {profile && !waiting ? (
        <TouchableOpacity onPress={onOpenWork} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Åpne tilbudsarbeid</Text>
        </TouchableOpacity>
      ) : null}
      {profile ? (
        <Text style={{ color: colors.muted }}>
          Registrert som {profile.username} · {profile.email} · {profile.portal}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  save: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
});
