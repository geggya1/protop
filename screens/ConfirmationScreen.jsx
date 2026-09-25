// src/screens/ConfirmationScreen.jsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Alert, TouchableOpacity, ActivityIndicator, Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { sendVerificationEmailV2 } from '../src/utils/sendVerificationEmail';

export default function ConfirmationScreen({ route }) {
  const { email, password, forChild } = route?.params || {};
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);

  const handleResendEmail = async () => {
    setLoading(true);
    try {
      if (!email || !password) {
        Alert.alert('Trenger innlogging', 'Gå til innlogging og skriv e-post og passord for å sende bekreftelsesmail på nytt.');
        return;
      }
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await sendVerificationEmailV2(cred.user.email || email);
      await signOut(auth);
      Alert.alert('E-post sendt på nytt', `Bekreftelsesmail er sendt til ${email}.`);
    } catch (error) {
      let msg = 'Kunne ikke sende e-post på nytt.';
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') msg = 'Feil passord.';
      else if (error.code === 'auth/user-not-found') msg = 'Bruker ikke funnet.';
      Alert.alert('Feil', msg);
    } finally { setLoading(false); }
  };

  const handleGoToLogin = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bruker opprettet!</Text>

      {forChild ? (
        <>
          <Text style={styles.text}>Barnets konto er nå klar. Under ser du innloggingsinformasjon:</Text>
          <Text style={styles.credential}>👤 Brukernavn: <Text style={styles.bold}>{email}</Text></Text>
          <Text style={styles.credential}>🔐 Passord: <Text style={styles.bold}>{password}</Text></Text>
          <Text style={styles.info}>
            Barnet kan nå logge inn på{' '}
            <Text style={styles.link} onPress={() => Linking.openURL('https://www.protop.no')}>www.protop.no</Text>
            {' '}eller via appen.
          </Text>
          <TouchableOpacity onPress={handleGoToLogin} style={styles.button}><Text style={styles.buttonText}>Gå til innlogging</Text></TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.text}>En e-post er sendt til {email}. Sjekk innboksen din for å fullføre registreringen.</Text>
          {loading ? (
            <ActivityIndicator size="large" color="#007bff" />
          ) : (
            <TouchableOpacity onPress={handleResendEmail} style={styles.button}>
              <Text style={styles.buttonText}>Send e-post på nytt</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleGoToLogin} style={styles.button}><Text style={styles.buttonText}>Gå til innlogging</Text></TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '400', marginBottom: 20, textAlign: 'center' },
  text: { fontSize: 16, textAlign: 'center', marginBottom: 20 },
  credential: { fontSize: 16, marginBottom: 6 },
  bold: { fontWeight: '400', color: '#000' },
  info: { fontSize: 14, marginTop: 15, textAlign: 'center', color: '#333' },
  link: { color: '#007bff', textDecorationLine: 'underline' },
  button: { width: '80%', padding: 12, marginTop: 20, backgroundColor: '#007bff', borderRadius: 6, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16 },
});
