import React, { useMemo, useState } from 'react';
import {
  Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { radius, space, type } from '../../src/ui/tokens';
import { ALTINN_FORM_URL, APPLICATION_INFO_URL, buildArbeidstilsynetApplication } from '../../src/arbeid/arbeidstilsynetApplication.js';
import { formatDateNb } from '../../src/arbeid/workingTimeRules.js';

async function copyText(value) {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    await Share.share({ message: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Forslag til øverste leder og administrator: ferdig utformet søknad om utvidet overtid
 * hos Arbeidstilsynet (aml. § 10-6 (6)). Hvert avsnitt kan kopieres rett inn i Altinn.
 * Vises bare for dem som får varsel om overskridelser (se workingTimeAlertRecipients).
 */
export default function ArbeidstilsynetDraft({
  colors, company, employee, result, entries, applicant, nativeID = 'arbeidstilsynet-draft',
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const draft = useMemo(
    () => (open ? buildArbeidstilsynetApplication({ company, employee, result, entries, applicant }) : null),
    [open, company, employee, result, entries, applicant],
  );

  async function copy(id, value) {
    if (await copyText(value)) setCopied(id);
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => { setCopied(''); setOpen(true); }}
        accessibilityRole="button"
        nativeID={`${nativeID}-open`}
        style={[styles.primary, { backgroundColor: colors.brand }]}
      >
        <Text style={[type.bodyStrong, { color: colors.onBrand || colors.card }]}>Lag søknad til Arbeidstilsynet</Text>
      </TouchableOpacity>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Lukk søknaden" />
          <View
            style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}
            accessibilityViewIsModal
            nativeID={nativeID}
          >
            <View style={styles.head}>
              <Text style={[type.title, { color: colors.ink, flex: 1 }]} accessibilityRole="header">
                Søknad om utvidet overtid
              </Text>
              <TouchableOpacity onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Lukk">
                <Text style={[type.body, { color: colors.brand }]}>Lukk</Text>
              </TouchableOpacity>
            </View>
            {draft ? (
              <ScrollView contentContainerStyle={styles.body}>
                <Text style={[type.body, { color: colors.ink }]}>
                  {`Utkastet er fylt ut fra bedriften og timelisten. Fyll inn det som står i [klammer], kopier avsnittene inn i søknaden i Altinn og legg ved vedleggene. Send senest ${formatDateNb(draft.sendBy)} for oppstart ${formatDateNb(draft.start)}: Arbeidstilsynet godkjenner ikke i etterkant.`}
                </Text>
                <View style={styles.actions}>
                  <TouchableOpacity
                    onPress={() => copy('all', draft.fullText)}
                    accessibilityRole="button"
                    nativeID={`${nativeID}-copy-all`}
                    style={[styles.primary, { backgroundColor: colors.brand }]}
                  >
                    <Text style={[type.bodyStrong, { color: colors.onBrand || colors.card }]}>
                      {copied === 'all' ? 'Kopiert' : 'Kopier hele søknaden'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => Linking.openURL(ALTINN_FORM_URL).catch(() => {})}
                    accessibilityRole="link"
                    style={[styles.secondary, { borderColor: colors.line }]}
                  >
                    <Text style={[type.body, { color: colors.ink }]}>Åpne søknaden i Altinn</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => Linking.openURL(APPLICATION_INFO_URL).catch(() => {})} accessibilityRole="link">
                    <Text style={[type.body, { color: colors.brand }]}>Krav fra Arbeidstilsynet</Text>
                  </TouchableOpacity>
                </View>
                {draft.sections.map((row) => (
                  <View key={row.id} style={[styles.section, { borderColor: colors.line }]} nativeID={`${nativeID}-${row.id}`}>
                    <View style={styles.head}>
                      <Text style={[type.bodyStrong, { color: colors.ink, flex: 1 }]}>{row.title}</Text>
                      <TouchableOpacity onPress={() => copy(row.id, row.text)} accessibilityRole="button" accessibilityLabel={`Kopier ${row.title}`}>
                        <Text style={[type.body, { color: colors.brand }]}>{copied === row.id ? 'Kopiert' : 'Kopier'}</Text>
                      </TouchableOpacity>
                    </View>
                    <Text selectable style={[type.body, { color: colors.ink }]}>{row.text}</Text>
                  </View>
                ))}
                <View style={[styles.section, { borderColor: colors.line }]} nativeID={`${nativeID}-checklist`}>
                  <Text style={[type.bodyStrong, { color: colors.ink }]}>Vedlegg som må være med</Text>
                  {draft.checklist.map((row) => (
                    <Text key={row} style={[type.body, { color: colors.ink }]}>{`• ${row}`}</Text>
                  ))}
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: space.md },
  sheet: { width: '100%', maxWidth: 760, maxHeight: '92%', borderWidth: 1, borderRadius: radius.sheet, padding: space.md, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  body: { gap: space.sm, paddingBottom: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  primary: { alignSelf: 'flex-start', borderRadius: radius.control, paddingHorizontal: space.md, paddingVertical: space.xs, minHeight: 40, justifyContent: 'center' },
  secondary: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.md, paddingVertical: space.xs, minHeight: 40, justifyContent: 'center' },
  section: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: space.xxs },
});
