import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radius } from '../src/theme';
import { useI18n } from '../src/i18n';

function tr(t, key, vars = {}) {
  let s = t(key);
  Object.entries(vars).forEach(([k, v]) => {
    s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
  });
  return s;
}

export function passwordRules(password, { minLen = 8, requireMixed = true } = {}) {
  const lenOK = password.length >= minLen;
  if (!requireMixed) return { lenOK, strong: lenOK };
  const hasUpper = /[A-ZÆØÅ]/.test(password);
  const hasLower = /[a-zæøå]/.test(password);
  const hasDigit = /\d/.test(password);
  return { lenOK, hasUpper, hasLower, hasDigit, strong: lenOK && hasUpper && hasLower && hasDigit };
}

export default function PasswordFields({
  password,
  onPasswordChange,
  confirm,
  onConfirmChange,
  minLen = 8,
  requireMixed = true,
  hint,
}) {
  const { t } = useI18n();
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const rules = useMemo(
    () => passwordRules(password, { minLen, requireMixed }),
    [password, minLen, requireMixed],
  );
  const match = confirm.length > 0 && password === confirm;
  const mismatch = confirm.length > 0 && password !== confirm;

  const Rule = ({ ok, text }) => (
    <View style={styles.ruleRow}>
      <Text style={[styles.ruleDot, ok ? styles.ruleOk : styles.ruleBad]}>{ok ? '●' : '○'}</Text>
      <Text style={[styles.ruleText, ok ? styles.ok : styles.bad]}>{text}</Text>
    </View>
  );

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.lbl}>{t('auth.password')}</Text>
      <View style={styles.row}>
        <TextInput
          value={password}
          onChangeText={onPasswordChange}
          secureTextEntry={!showPw}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { flex: 1 }]}
        />
        <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowPw((v) => !v)}>
          <Text style={styles.toggleTxt}>{showPw ? t('auth.hidePassword') : t('auth.showPassword')}</Text>
        </TouchableOpacity>
      </View>

      {requireMixed ? (
        <View style={styles.rulesBox}>
          <Rule ok={rules.lenOK} text={tr(t, 'auth.pwMinLen', { n: minLen })} />
          <Rule ok={rules.hasUpper} text={t('auth.pwUpper')} />
          <Rule ok={rules.hasLower} text={t('auth.pwLower')} />
          <Rule ok={rules.hasDigit} text={t('auth.pwDigit')} />
        </View>
      ) : (
        <Text style={styles.hint}>{tr(t, 'auth.pwSimpleHint', { n: minLen })}</Text>
      )}

      <Text style={styles.lbl}>{t('auth.repeatPassword')}</Text>
      <View style={styles.row}>
        <TextInput
          value={confirm}
          onChangeText={onConfirmChange}
          secureTextEntry={!showConfirm}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { flex: 1 }, mismatch && styles.inputError]}
        />
        <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowConfirm((v) => !v)}>
          <Text style={styles.toggleTxt}>{showConfirm ? t('auth.hidePassword') : t('auth.showPassword')}</Text>
        </TouchableOpacity>
      </View>
      {match ? <Text style={styles.ok}>{t('auth.passwordMatch')}</Text> : null}
      {mismatch ? <Text style={styles.warn}>{t('auth.passwordMismatch')}</Text> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  lbl: { fontWeight: '400', color: colors.ink, fontSize: 16, marginTop: 4 },
  hint: { color: colors.muted, fontWeight: '400' },
  warn: { color: colors.warn, fontWeight: '400' },
  ok: { color: '#047857', fontWeight: '400' },
  bad: { color: '#b91c1c' },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    padding: 14, fontSize: 18, fontWeight: '400',
  },
  inputError: { borderColor: colors.danger },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 14, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.sunken,
  },
  toggleTxt: { fontWeight: '400', color: colors.ink, fontSize: 14 },
  rulesBox: {
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    padding: 10, backgroundColor: colors.sunken,
  },
  ruleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  ruleDot: { width: 18, textAlign: 'center', marginRight: 6, fontSize: 12 },
  ruleOk: { color: '#047857' },
  ruleBad: { color: '#94a3b8' },
  ruleText: { fontSize: 13, color: colors.ink },
});
