// src/screens/AddNote.jsx
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  ScrollView,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import TopNavBar from '../components/TopNavBar';
import DateTimePicker from '@react-native-community/datetimepicker';

const pad = (n) => (n < 10 ? `0${n}` : `${n}`);

export default function AddNote({ route, navigation }) {
  const {
    familyId,
    childId,
    dateKey,               // "YYYY-MM-DD"
    existing = {},         // { text: '', timeBlocks: [] }
    allowDelete = false,   // vis “Slett” kun ved redigering
  } = route.params || {};

  const [text, setText] = useState(existing.text || '');
  const [time, setTime] = useState(''); // "HH:mm"
  const [showPicker, setShowPicker] = useState(false);
  const [nativePickerValue, setNativePickerValue] = useState(() => new Date());

  const canSave = useMemo(
    () => !!familyId && !!childId && !!dateKey,
    [familyId, childId, dateKey]
  );

  const timeFromDate = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const openTimePicker = () => {
    Keyboard.dismiss(); // skjul tastatur før klokke
    if (time && /^\d{2}:\d{2}$/.test(time)) {
      const [h, m] = time.split(':').map((x) => parseInt(x, 10));
      const d = new Date();
      d.setHours(h); d.setMinutes(m); d.setSeconds(0); d.setMilliseconds(0);
      setNativePickerValue(d);
    } else {
      const d = new Date();
      d.setSeconds(0); d.setMilliseconds(0);
      setNativePickerValue(d);
    }
    setShowPicker(true);
  };

  const handleSave = async () => {
    if (!canSave) {
      Alert.alert('Feil', 'Mangler nøkkeldata (familyId/childId/dateKey).');
      return;
    }
    if (!text.trim() && !String(time).trim()) {
      Alert.alert('Feil', 'Skriv inn et notat eller et tidspunkt.');
      return;
    }

    try {
      const prevBlocks = Array.isArray(existing.timeBlocks) ? existing.timeBlocks : [];
      let nextBlocks = [...prevBlocks];

      const timeStr = String(time || '').trim();
      if (timeStr) {
        nextBlocks.push({
          time: timeStr,
          title: (text || '').trim(),
          createdAtMs: Date.now(),
        });
      }

      // sorter tidsblokker lav → høy
      nextBlocks = nextBlocks
        .filter((b) => b && typeof b === 'object')
        .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));

      const payload = {
        text: (text || '').trim(),
        timeBlocks: nextBlocks,
        updatedAt: serverTimestamp(),
      };

      const ref = doc(db, 'families', familyId, 'children', childId, 'dailyNotes', dateKey);
      await setDoc(ref, payload, { merge: true });

      navigation.goBack();
    } catch (e) {
      console.error('Feil ved lagring av dagsnotat:', e);
      Alert.alert('Feil', 'Kunne ikke lagre notatet.');
    }
  };

  const handleDelete = async () => {
    if (!canSave) return;
    Alert.alert('Slett notat', 'Vil du slette hele dagsnotatet for denne datoen?', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Slett',
        style: 'destructive',
        onPress: async () => {
          try {
            const ref = doc(db, 'families', familyId, 'children', childId, 'dailyNotes', dateKey);
            await deleteDoc(ref);
            navigation.goBack();
          } catch (e) {
            console.error('Feil ved sletting av dagsnotat:', e);
            Alert.alert('Feil', 'Kunne ikke slette notatet.');
          }
        },
      },
    ]);
  };

  // Enkel web-picker (timer/minutter i liste)
  const [showSimplePicker, setShowSimplePicker] = useState(false);
  const hours = Array.from({ length: 24 }, (_, i) => pad(i));
  const minutes = ['00','05','10','15','20','25','30','35','40','45','50','55'];

  const SimpleTimePicker = () => {
    const [hSel, setHSel] = useState(() => (time ? time.split(':')[0] : pad(new Date().getHours())));
    const [mSel, setMSel] = useState(() => (time ? time.split(':')[1] : pad(new Date().getMinutes() - (new Date().getMinutes()%5))));

    return (
      <Modal visible={showSimplePicker} transparent animationType="fade" onRequestClose={() => setShowSimplePicker(false)}>
        <View style={styles.overlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Velg klokkeslett</Text>
            <View style={styles.pickerRows}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerColTitle}>Timer</Text>
                <FlatList
                  data={hours}
                  keyExtractor={(x) => x}
                  style={{ maxHeight: 180 }}
                  keyboardShouldPersistTaps="always"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.pill, hSel === item && styles.pillActive]}
                      onPress={() => setHSel(item)}
                    >
                      <Text style={[styles.pillTxt, hSel === item && styles.pillTxtActive]}>{item}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerColTitle}>Minutter</Text>
                <FlatList
                  data={minutes}
                  keyExtractor={(x) => x}
                  style={{ maxHeight: 180 }}
                  keyboardShouldPersistTaps="always"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.pill, mSel === item && styles.pillActive]}
                      onPress={() => setMSel(item)}
                    >
                      <Text style={[styles.pillTxt, mSel === item && styles.pillTxtActive]}>{item}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSecondary]} onPress={() => setShowSimplePicker(false)}>
                <Text style={styles.modalBtnSecondaryTxt}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={() => {
                  const v = `${hSel}:${mSel}`;
                  setTime(v);
                  setShowSimplePicker(false);
                }}
              >
                <Text style={styles.modalBtnPrimaryTxt}>Bruk {hSel}:{mSel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.screen}>
      {/* Standard TopNavBar */}
      <TopNavBar title="Legg til notat" showBack onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 70 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="always"
          style={Platform.OS === 'web' ? { touchAction: 'manipulation' } : null}
        >
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Dato</Text>
            <Text style={styles.infoVal}>{dateKey || '-'}</Text>
          </View>

          <Text style={styles.label}>Notat</Text>
          <TextInput
            style={[styles.input, { height: 110, textAlignVertical: 'top' }]}
            placeholder="Skriv inn et notat (f.eks. husk svømmetrening)"
            value={text}
            onChangeText={setText}
            multiline
            returnKeyType="done"
          />

          <Text style={styles.label}>Tidspunkt (valgfritt)</Text>

          <TouchableOpacity
            onPress={() => {
              if (Platform.OS === 'web') { Keyboard.dismiss(); setShowSimplePicker(true); }
              else openTimePicker();
            }}
            accessibilityLabel="Velg klokkeslett"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View pointerEvents="none">
              <TextInput
                style={styles.input}
                placeholder="F.eks. 16:00"
                value={time}
                editable={false}
              />
            </View>
          </TouchableOpacity>

          {showPicker && Platform.OS !== 'web' && (
            <DateTimePicker
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              value={nativePickerValue}
              is24Hour
              onChange={(event, selectedDate) => {
                if (Platform.OS === 'android') setShowPicker(false);
                if (selectedDate) {
                  setNativePickerValue(selectedDate);
                  setTime(timeFromDate(selectedDate));
                }
              }}
            />
          )}

          <SimpleTimePicker />

          <View style={{ height: 12 }} />

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} accessibilityRole="button">
            <Ionicons name="save-outline" size={20} color="#fff" />
            <Text style={styles.saveBtnText}>Lagre notat</Text>
          </TouchableOpacity>

          {allowDelete && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} accessibilityRole="button">
              <Ionicons name="trash-outline" size={18} color="#b91c1c" />
              <Text style={styles.deleteBtnText}>Slett notat for denne datoen</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 30 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6fbff' },
  container: { padding: 20 },
  infoRow: { flexDirection: 'row', marginBottom: 8, gap: 8 },
  infoKey: { color: '#64748b', fontWeight: '400' },
  infoVal: { color: '#0f172a', fontWeight: '400' },
  label: { fontSize: 16, fontWeight: '400', marginTop: 14, marginBottom: 6, color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  saveBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b74d1',
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '400', marginLeft: 8 },

  deleteBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fee2e2',
  },
  deleteBtnText: { color: '#b91c1c', fontWeight: '400', marginLeft: 6 },

  // web-picker styles
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center'
  },
  pickerCard: {
    width: 320, backgroundColor: '#fff', borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: '#e2e8f0'
  },
  pickerTitle: { fontWeight: '400', color: '#0f172a', fontSize: 16, marginBottom: 8 },
  pickerRows: { flexDirection: 'row', gap: 12 },
  pickerColTitle: { fontWeight: '400', color: '#0b1f33', marginBottom: 6 },
  pill: {
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 6
  },
  pillActive: { backgroundColor: '#0b74d1', borderColor: '#0b74d1' },
  pillTxt: { color: '#0f172a', fontWeight: '400' },
  pillTxtActive: { color: '#fff' },
  modalBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10 },
  modalBtnSecondary: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  modalBtnSecondaryTxt: { color: '#1f2937', fontWeight: '400' },
  modalBtnPrimary: { backgroundColor: '#0b74d1' },
  modalBtnPrimaryTxt: { color: '#fff', fontWeight: '400' },
});
