import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { auth } from '../firebase';
import { applyActionCode, checkActionCode, reload } from 'firebase/auth';

function useQueryParams() {
  const { params = {} } = useRoute();
  return {
    mode: params.mode,
    oobCode: params.oobCode || params.oobcode,
    continueUrl: params.continueUrl || params.continueurl,
    lang: params.lang,
  };
}

export default function EmailActionScreen() {
  const navigation = useNavigation();
  const { mode, oobCode } = useQueryParams();

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!oobCode) throw new Error('Missing code');
        await checkActionCode(auth, oobCode);
        if (mounted) setValid(true);
      } catch {
        if (mounted) setValid(false);
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, [oobCode]);

  const applyNow = useCallback(async () => {
    try {
      setApplying(true);
      await applyActionCode(auth, oobCode);
      if (auth.currentUser) await reload(auth.currentUser);
      Alert.alert('Bekreftet', 'E-posten er verifisert.');
      navigation.replace('FamilyOverview');
    } catch (e) {
      Alert.alert('Kunne ikke fullføre', 'Lenken er brukt eller utløpt. Be om en ny fra appen.');
    } finally {
      setApplying(false);
    }
  }, [oobCode, navigation]);

  const title =
    mode === 'verifyEmail' ? 'Bekreft e-post' :
    mode === 'recoverEmail' ? 'Gjenopprett e-post' :
    mode === 'resetPassword' ? 'Tilbakestill passord' :
    'E-posthandling';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      {checking ? (
        <ActivityIndicator size="large" />
      ) : valid ? (
        <>
          <Text style={styles.subtitle}>Trykk for å fullføre.</Text>
          <TouchableOpacity style={styles.primary} onPress={applyNow} disabled={applying}>
            {applying ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Fullfør</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.error}>Lenken er ugyldig eller allerede brukt.</Text>
          <TouchableOpacity style={styles.secondary} onPress={() => navigation.replace('VerifyEmail')}>
            <Text style={styles.secondaryText}>Be om ny lenke</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,alignItems:'center',justifyContent:'center',padding:24,backgroundColor:'#fff'},
  title:{fontSize:22,fontWeight: '400',color:'#0f172a',marginBottom:10},
  subtitle:{fontSize:15,color:'#334155',textAlign:'center',marginBottom:14},
  primary:{backgroundColor:'#0b74d1',paddingVertical:12,paddingHorizontal:20,borderRadius:12,minWidth:220,alignItems:'center'},
  primaryText:{color:'#fff',fontSize:16,fontWeight: '400'},
  secondary:{marginTop:12,backgroundColor:'#e2e8f0',paddingVertical:10,paddingHorizontal:20,borderRadius:12,minWidth:220,alignItems:'center'},
  secondaryText:{color:'#0f172a',fontSize:15,fontWeight: '400'},
  error:{color:'#b91c1c',textAlign:'center',marginBottom:10},
});
