import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../src/theme';
import BrandToggle from './BrandToggle';
import { MAIL_FONTS, MAIL_FONT_SIZES, resizeLogoDataUrl, buildSignatureHtml } from '../src/utils/mailSignature';
import { sanitizeHtml } from '../src/utils/sanitizeHtml';

export default function MailSignatureSettings({ prefs, onChange }) {
  const sig = prefs?.signature || {};

  const patchSig = (patch) => {
    onChange({ signature: { ...sig, ...patch } });
  };

  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted' && Platform.OS !== 'web') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.72,
      base64: true,
      allowsEditing: Platform.OS !== 'web',
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset) return;
    const mime = asset.mimeType || 'image/jpeg';
    const dataUrl = asset.base64
      ? `data:${mime};base64,${asset.base64}`
      : asset.uri;
    const resized = await resizeLogoDataUrl(dataUrl, 180);
    patchSig({ logoDataUrl: resized });
  };

  const preview = buildSignatureHtml(sig, { preview: true });

  return (
    <View>
      <Text style={styles.kicker}>Signatur</Text>
      <View style={styles.optionRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.optionLbl}>Bruk e-postsignatur</Text>
          <Text style={styles.hint}>Legges inn automatisk i nye meldinger, som i Outlook.</Text>
        </View>
        <BrandToggle value={sig.enabled !== false} onValueChange={(v) => patchSig({ enabled: v })} />
      </View>
      <View style={styles.optionRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.optionLbl}>Ta med i svar og videresending</Text>
        </View>
        <BrandToggle
          value={sig.includeOnReply !== false}
          onValueChange={(v) => patchSig({ includeOnReply: v })}
        />
      </View>

      <TextInput style={styles.input} value={sig.name} onChangeText={(name) => patchSig({ name })} placeholder="Navn" />
      <TextInput style={styles.input} value={sig.title} onChangeText={(title) => patchSig({ title })} placeholder="Tittel" />
      <TextInput style={styles.input} value={sig.company} onChangeText={(company) => patchSig({ company })} placeholder="Firma / avdeling" />
      <TextInput style={styles.input} value={sig.phone} onChangeText={(phone) => patchSig({ phone })} placeholder="Telefon" keyboardType="phone-pad" />
      <TextInput style={styles.input} value={sig.website} onChangeText={(website) => patchSig({ website })} placeholder="Nettside" autoCapitalize="none" />
      <TextInput
        style={[styles.input, styles.area]}
        value={sig.extra}
        onChangeText={(extra) => patchSig({ extra })}
        placeholder="Ekstra linje (adresse, disclaimer…)"
        multiline
      />

      <View style={styles.logoRow}>
        {sig.logoDataUrl ? (
          <Image source={{ uri: sig.logoDataUrl }} style={styles.logo} />
        ) : (
          <View style={styles.logoEmpty}>
            <Ionicons name="image-outline" size={18} color={colors.muted} />
          </View>
        )}
        <View style={{ flex: 1, gap: 6 }}>
          <TouchableOpacity onPress={pickLogo} style={styles.secondaryBtn}>
            <Text style={styles.secondaryTxt}>{sig.logoDataUrl ? 'Bytt logo' : 'Legg til logo'}</Text>
          </TouchableOpacity>
          {sig.logoDataUrl ? (
            <TouchableOpacity onPress={() => patchSig({ logoDataUrl: '' })}>
              <Text style={styles.linkDanger}>Fjern logo</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {preview ? (
        <View style={styles.preview}>
          <Text style={styles.previewLbl}>Forhåndsvisning</Text>
          {Platform.OS === 'web'
            ? React.createElement('div', {
              dangerouslySetInnerHTML: { __html: sanitizeHtml(preview) },
            })
            : <Text style={styles.hint}>Logo og navn vises formatert når du sender.</Text>}
        </View>
      ) : null}

      <Text style={[styles.kicker, { marginTop: 18 }]}>Skrift og visning</Text>
      <Text style={styles.optionLbl}>Skrifttype</Text>
      <View style={styles.chips}>
        {MAIL_FONTS.map((font) => (
          <TouchableOpacity
            key={font.id}
            onPress={() => onChange({ fontFamily: font.value })}
            style={[styles.chip, prefs.fontFamily === font.value && styles.chipOn]}
          >
            <Text style={[styles.chipTxt, prefs.fontFamily === font.value && styles.chipTxtOn]}>{font.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.optionLbl, { marginTop: 10 }]}>Skriftstørrelse</Text>
      <View style={styles.chips}>
        {MAIL_FONT_SIZES.map((size) => (
          <TouchableOpacity
            key={size}
            onPress={() => onChange({ fontSize: size })}
            style={[styles.chip, prefs.fontSize === size && styles.chipOn]}
          >
            <Text style={[styles.chipTxt, prefs.fontSize === size && styles.chipTxtOn]}>{size}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.optionRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.optionLbl}>Vis blindkopi som standard</Text>
        </View>
        <BrandToggle value={!!prefs.showBcc} onValueChange={(showBcc) => onChange({ showBcc })} />
      </View>
      <View style={styles.optionRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.optionLbl}>Kompakt meldingsliste</Text>
        </View>
        <BrandToggle value={!!prefs.compactList} onValueChange={(compactList) => onChange({ compactList })} />
      </View>
      <View style={styles.optionRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.optionLbl}>Be om lesekvittering som standard</Text>
          <Text style={styles.hint}>Mottakers e-postklient avgjør om kvittering sendes.</Text>
        </View>
        <BrandToggle value={!!prefs.readReceipt} onValueChange={(readReceipt) => onChange({ readReceipt })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: 11, fontWeight: '400', color: colors.muted, letterSpacing: 0.42,
    textTransform: 'uppercase', marginBottom: 8, marginTop: 18,
  },
  hint: { fontSize: 12, fontWeight: '400', color: colors.muted, lineHeight: 16 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  optionLbl: { fontSize: 13, fontWeight: '500', color: colors.ink, marginBottom: 2 },
  input: {
    borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 13, color: colors.ink, marginTop: 8,
  },
  area: { minHeight: 64, textAlignVertical: 'top' },
  logoRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 12 },
  logo: { width: 72, height: 72, borderRadius: 8, backgroundColor: colors.bg },
  logoEmpty: {
    width: 72, height: 72, borderRadius: 8, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line,
  },
  secondaryBtn: {
    alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
  },
  secondaryTxt: { fontSize: 12, fontWeight: '400', color: colors.ink },
  linkDanger: { color: colors.danger, fontWeight: '400', fontSize: 12 },
  preview: {
    marginTop: 12, padding: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: '#f8fafc',
  },
  previewLbl: { fontSize: 10, fontWeight: '400', color: colors.muted, textTransform: 'uppercase', marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
  },
  chipOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  chipTxt: { fontSize: 12, fontWeight: '400', color: colors.muted },
  chipTxtOn: { color: colors.brand },
});
