import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { colors } from '../src/theme';
import { sendPasswordResetV2 } from '../src/utils/sendPasswordReset';

export default function ForgotPasswordScreen({ navigation, route }) {
  const prefill = route?.params?.prefill || '';
  const [email, setEmail] = useState(prefill);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  const emailTrimmed = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^@\s]+$/i;
  const looksLikeEmail = useMemo(() => emailRegex.test(emailTrimmed), [emailTrimmed]);

  const onSend = async () => {
    setError(null);
    if (!emailTrimmed) return setError('Skriv inn e-postadressen din.');
    try {
      setLoading(true);
      await sendPasswordResetV2(emailTrimmed);
      setDone(true);
      Alert.alert('Sendt', 'Vi har sendt en e-post for å velge nytt passord. Sjekk også søppelpost.');
    } catch (err) {
      setError(err?.message || 'Kunne ikke sende e-post for tilbakestilling.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.container}>
      <Text style={s.title}>Tilbakestill passord</Text>
      <Text style={s.text}>
        Skriv e-posten din. Vi sender en lenke til Firebase sitt vanlige skjema for nytt passord.
      </Text>

      <TextInput
        style={[s.input, email.length > 0 && looksLikeEmail === false && email.includes('@') ? s.inputError : null]}
        placeholder="E-post"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={(t) => { setEmail(t); if (error) setError(null); }}
        editable={!loading}
      />

      {error ? <Text style={s.error}>{error}</Text> : null}
      {done ? (
        <Text style={s.info}>Sjekk innboksen (og søppelpost). Lenken åpner Firebase sitt passordskjema.</Text>
      ) : null}

      <TouchableOpacity style={[s.primaryBtn, loading && { opacity: 0.6 }]} onPress={onSend} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Send lenke</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={s.secondaryBtn} onPress={() => navigation.navigate('Login')}>
        <Text style={s.secondaryText}>Tilbake til innlogging</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container:{ flex:1, padding:20, justifyContent:'center', backgroundColor: colors.bg },
  title:{ fontSize:22, fontWeight:'700', textAlign:'center', marginBottom:10 },
  text:{ textAlign:'center', color:'#334155', marginBottom:14 },
  input:{ borderWidth:1, borderColor:'#cbd5e1', borderRadius:8, paddingHorizontal:12, paddingVertical:10, backgroundColor: colors.card, marginBottom:8 },
  inputError:{ borderColor:'#ef4444', backgroundColor:'#fff1f2' },
  error:{ color:'#b91c1c', textAlign:'center', marginBottom:8, fontSize:12 },
  info:{ color: colors.brand, textAlign:'center', marginBottom:8, fontSize:12 },
  primaryBtn:{ backgroundColor: colors.brand, paddingVertical:14, borderRadius:16, alignItems:'center', marginTop:6 },
  primaryText:{ color:'#fff', fontWeight:'700', fontSize:16 },
  secondaryBtn:{ marginTop:12, alignItems:'center' },
  secondaryText:{ color: colors.brand, fontWeight:'600' },
});
