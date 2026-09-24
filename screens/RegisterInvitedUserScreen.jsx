// src/screens/RegisterInvitedUserScreen.jsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { auth, db } from '../firebase';
import {
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'firebase/auth';
import {
  setDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { sendVerificationEmailV2 } from '../src/utils/sendVerificationEmail';

// NB! Denne skjermen er kun for INVITERTE FORELDRE, ikke barn!
export default function RegisterInvitedUserScreen({ route }) {
  const { email, familyId, name } = route.params;
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();

  const handleRegister = async () => {
    if (!password || !confirmPassword) {
      return Alert.alert('Feil', 'Fyll ut begge passordfeltene.');
    }
    if (password !== confirmPassword) {
      return Alert.alert('Feil', 'Passordene stemmer ikke overens.');
    }
    if (password.length < 6) {
      return Alert.alert('Feil', 'Passordet må være minst 6 tegn.');
    }

    setLoading(true);
    try {
      // 1. Opprett bruker i Firebase Authentication
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const sendMailP = sendVerificationEmailV2(email);
      await updateProfile(cred.user, { displayName: name });
      await sendMailP;

      // 4. Opprett dokument i Firestore
      await setDoc(doc(db, 'parents', cred.user.uid), {
        uid: cred.user.uid,
        email,
        name,
        familyId,
        createdAt: serverTimestamp(),
        active: true,
      });

      // 5. Marker invitasjonen som brukt/aktiv
      const invitedParentRef = doc(db, 'families', familyId, 'invites', email);
      await updateDoc(invitedParentRef, { active: true });

      // 6. Logg ut brukeren etter registrering
      if (auth.currentUser) {
        await signOut(auth);
      }

      setLoading(false);

      Alert.alert(
        'Verifisering kreves',
        'En e-post er sendt for å bekrefte kontoen. Bekreft før du logger inn.'
      );

      // 7. Naviger til innlogging
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (err) {
      console.error('Feil ved registrering:', err);
      let msg = 'Noe gikk galt. Prøv igjen senere.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'E-posten er allerede registrert.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Passordet må være minst 6 tegn.';
      }
      Alert.alert('Feil', msg);
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Fullfør registrering</Text>
      <Text style={styles.text}>E-post: {email}</Text>

      <TextInput
        style={styles.input}
        placeholder="Passord"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!loading}
      />
      <TextInput
        style={styles.input}
        placeholder="Bekreft passord"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        editable={!loading}
      />

      {loading ? (
        <ActivityIndicator size="large" style={{ marginVertical: 20 }} />
      ) : (
        <Button title="Fullfør registrering" onPress={handleRegister} />
      )}

      <View style={{ marginTop: 20 }}>
        <Button
          title="Tilbake til innlogging"
          onPress={() => navigation.goBack()}
          disabled={loading}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  heading: { fontSize: 24, marginBottom: 20, textAlign: 'center' },
  text: { fontSize: 16, textAlign: 'center', marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    marginBottom: 10,
    padding: 10,
  },
});
