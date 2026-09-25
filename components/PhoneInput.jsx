import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, FlatList, StyleSheet,
} from 'react-native';
import { colors, radius } from '../src/theme';
import { useI18n } from '../src/i18n';
import {
  PHONE_COUNTRIES, defaultDialCode, splitPhone, parsePhoneInput,
} from '../src/utils/phone';

export default function PhoneInput({ value, onChange, placeholder, style }) {
  const { t, lang } = useI18n();
  const fallbackDial = defaultDialCode(lang);
  const initial = useMemo(() => splitPhone(value, fallbackDial), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [dialCode, setDialCode] = useState(initial.dialCode);
  const [national, setNational] = useState(initial.national);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const parts = splitPhone(value, fallbackDial);
    setDialCode(parts.dialCode);
    setNational(parts.national);
  }, [value, fallbackDial]);

  const emit = (dial, nat) => {
    onChange?.(parsePhoneInput(dial, nat));
  };

  const onNationalChange = (text) => {
    const cleaned = text.replace(/[^\d\s]/g, '');
    setNational(cleaned.replace(/\s/g, ''));
    emit(dialCode, cleaned.replace(/\s/g, ''));
  };

  const pickCountry = (c) => {
    setDialCode(c.dial);
    setPickerOpen(false);
    emit(c.dial, national);
  };

  const selected = PHONE_COUNTRIES.find((c) => c.dial === dialCode) || PHONE_COUNTRIES[0];

  return (
    <View style={[styles.row, style]}>
      <TouchableOpacity style={styles.dialBtn} onPress={() => setPickerOpen(true)}>
        <Text style={styles.dialFlag}>{selected.flag}</Text>
        <Text style={styles.dialTxt}>{selected.dial}</Text>
      </TouchableOpacity>
      <TextInput
        value={national}
        onChangeText={onNationalChange}
        keyboardType="phone-pad"
        placeholder={placeholder || t('auth.phone')}
        style={styles.input}
      />

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>{t('profile.phoneCountry')}</Text>
            <FlatList
              data={PHONE_COUNTRIES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.countryRow, item.dial === dialCode && styles.countryActive]}
                  onPress={() => pickCountry(item)}
                >
                  <Text style={styles.countryFlag}>{item.flag}</Text>
                  <Text style={styles.countryName}>{item.name}</Text>
                  <Text style={styles.countryDial}>{item.dial}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  dialBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 14,
  },
  dialFlag: { fontSize: 18 },
  dialTxt: { fontWeight: '400', color: colors.ink, fontSize: 16 },
  input: {
    flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14, fontSize: 18, fontWeight: '400',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '70%', paddingBottom: 24,
  },
  sheetTitle: { fontWeight: '400', fontSize: 18, padding: 16, color: colors.ink },
  countryRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  countryActive: { backgroundColor: colors.brandSoft },
  countryFlag: { fontSize: 22, width: 36 },
  countryName: { flex: 1, fontWeight: '400', color: colors.ink, fontSize: 16 },
  countryDial: { fontWeight: '400', color: colors.muted },
});
