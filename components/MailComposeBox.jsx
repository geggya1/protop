import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import { DeskBtn } from './DeskBtn';
import MailRichEditor from './MailRichEditor';
import { sanitizeHtml } from '../src/utils/sanitizeHtml';
import { buildSignatureHtml, shouldIncludeSignature } from '../src/utils/mailSignature';

const IMPORTANCE = [
  { id: 'low', label: 'Lav', icon: 'arrow-down-outline' },
  { id: 'normal', label: 'Normal', icon: 'remove-outline' },
  { id: 'high', label: 'Høy', icon: 'arrow-up-outline' },
];

export default function MailComposeBox({
  compose,
  prefs,
  busy,
  onChange,
  onSend,
  onClose,
  onOpenSettings,
}) {
  const [showBcc, setShowBcc] = useState(
    () => !!(compose?.bcc) || prefs?.showBcc === true,
  );
  const includeSig = compose?.includeSignature !== false;
  const signatureHtml = useMemo(
    () => (includeSig && shouldIncludeSignature(prefs?.signature, compose?.mode)
      ? buildSignatureHtml(prefs?.signature, { preview: true })
      : ''),
    [includeSig, prefs?.signature, compose?.mode],
  );

  return (
    <View style={styles.mask}>
      <View style={styles.card}>
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.kicker}>Outlook</Text>
            <Text style={styles.title} numberOfLines={1}>{compose.title}</Text>
          </View>
          <TouchableOpacity onPress={onOpenSettings} accessibilityLabel="E-postinnstillinger" style={styles.iconBtn}>
            <Ionicons name="options-outline" size={18} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Lukk" style={styles.iconBtn}>
            <Ionicons name="close" size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <Field label="Til">
            <TextInput
              style={styles.input}
              value={compose.to}
              onChangeText={(to) => onChange({ to })}
              placeholder="navn@firma.no"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </Field>
          <Field label="Kopi">
            <TextInput
              style={styles.input}
              value={compose.cc}
              onChangeText={(cc) => onChange({ cc })}
              placeholder="Kopi"
              autoCapitalize="none"
            />
          </Field>
          {showBcc ? (
            <Field label="Blindkopi">
              <TextInput
                style={styles.input}
                value={compose.bcc}
                onChangeText={(bcc) => onChange({ bcc })}
                placeholder="Blindkopi"
                autoCapitalize="none"
              />
            </Field>
          ) : (
            <TouchableOpacity onPress={() => setShowBcc(true)} style={styles.bccLink}>
              <Text style={styles.link}>Vis blindkopi</Text>
            </TouchableOpacity>
          )}
          <Field label="Emne">
            <TextInput
              style={styles.input}
              value={compose.subject}
              onChangeText={(subject) => onChange({ subject })}
              placeholder="Emne"
            />
          </Field>
          <MailRichEditor
            key={compose.openedAt || compose.title}
            initialHtml={compose.body}
            onChange={(body) => onChange({ body })}
            fontFamily={prefs?.fontFamily}
            fontSize={prefs?.fontSize}
          />
          {signatureHtml && Platform.OS === 'web' ? (
            <View style={styles.sigBox}>
              <Text style={styles.sigLbl}>Signatur</Text>
              {React.createElement('div', {
                dangerouslySetInnerHTML: { __html: sanitizeHtml(signatureHtml) },
                style: { fontSize: 12, color: colors.ink },
              })}
            </View>
          ) : signatureHtml ? (
            <Text style={styles.sigFallback}>Signatur legges ved når du sender.</Text>
          ) : null}
        </ScrollView>
        {compose.error ? <Text style={styles.error}>{compose.error}</Text> : null}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            {IMPORTANCE.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => onChange({ importance: item.id })}
                style={[styles.imp, compose.importance === item.id && styles.impOn]}
                accessibilityLabel={`Viktighet ${item.label}`}
              >
                <Ionicons
                  name={item.icon}
                  size={14}
                  color={item.id === 'high' ? colors.danger : item.id === 'low' ? colors.muted : colors.ink}
                />
                <Text style={styles.impTxt}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => onChange({ readReceipt: !compose.readReceipt })}
              style={[styles.imp, compose.readReceipt && styles.impOn]}
              accessibilityLabel="Be om lesekvittering"
            >
              <Ionicons name="mail-open-outline" size={14} color={compose.readReceipt ? colors.brand : colors.ink} />
              <Text style={styles.impTxt}>Lesekvittering</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onChange({ includeSignature: !includeSig })}
              style={[styles.imp, includeSig && styles.impOn]}
              accessibilityLabel="Inkluder signatur"
            >
              <Ionicons name="pencil-outline" size={14} color={includeSig ? colors.brand : colors.ink} />
              <Text style={styles.impTxt}>Signatur</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.footerRight}>
            <DeskBtn label="Avbryt" onPress={onClose} />
            <DeskBtn primary icon="send" label={busy ? 'Sender…' : 'Send'} onPress={onSend} />
          </View>
        </View>
      </View>
    </View>
  );
}

function Field({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLbl}>{label}</Text>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  mask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '92%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingTop: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  kicker: {
    fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase',
  },
  title: { fontSize: 16, fontWeight: '600', color: colors.ink },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingTop: 8, maxHeight: 520 },
  field: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, minHeight: 40 },
  fieldLbl: { width: 78, fontSize: 12, fontWeight: '600', color: colors.muted },
  input: { fontSize: 13, color: colors.ink, paddingVertical: 8, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null) },
  bccLink: { paddingVertical: 8 },
  link: { color: colors.brand, fontWeight: '600', fontSize: 12 },
  sigBox: { marginTop: 8, marginBottom: 12, paddingTop: 4 },
  sigLbl: { fontSize: 10, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', marginBottom: 4 },
  sigFallback: { fontSize: 12, color: colors.muted, marginTop: 8, marginBottom: 12 },
  error: { color: colors.danger, fontWeight: '700', fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: '#f8fafc',
  },
  footerLeft: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, flex: 1 },
  footerRight: { flexDirection: 'row', gap: 8 },
  imp: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, height: 28, borderRadius: 6, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
  },
  impOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  impTxt: { fontSize: 11, fontWeight: '600', color: colors.ink },
});
