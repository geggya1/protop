import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import BrandToggle from './BrandToggle';
import OptionPicker from './OptionPicker';
import MailRichEditor from './MailRichEditor';
import { MAIL_FONTS } from '../src/utils/mailSignature';
import { MAIL_PREF_FONT_SIZES } from '../src/utils/mailComposePrefs';

const NONE = 'none';

/**
 * Signaturer som i Outlook: flere navngitte signaturer, egen standard for nye
 * meldinger og for svar. Signaturen kan limes inn rett fra en sendt e-post.
 */
export default function MailSignatureSettings({ prefs, onChange }) {
  const sigs = prefs?.signatures || [];
  const [editingId, setEditingId] = useState(() => sigs[0]?.id || null);
  const [name, setName] = useState(() => sigs[0]?.name || '');
  const htmlRef = useRef(sigs[0]?.html || '');
  const timer = useRef(null);
  const pending = useRef(null);
  const latest = useRef({ sigs, onChange });
  latest.current = { sigs, onChange };
  const editing = sigs.find((s) => s.id === editingId) || null;

  /** Lagrer ventende endring med en gang (bytte av signatur, lukking). */
  const flush = () => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    const { sigs: list, onChange: save } = latest.current;
    save({ signatures: list.map((s) => (s.id === p.id ? { ...s, name: p.name, html: p.html } : s)) });
  };

  useEffect(() => () => flush(), []);

  const schedule = (patch, delay) => {
    if (!editing) return;
    pending.current = { id: editing.id, name: patch.name, html: patch.html };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };

  const select = (s) => {
    flush();
    setEditingId(s.id);
    setName(s.name);
    htmlRef.current = s.html;
  };

  const addSignature = () => {
    flush();
    const id = `sig-${Date.now()}`;
    const next = [...sigs, { id, name: sigs.length ? `Signatur ${sigs.length + 1}` : 'Standard', html: '' }];
    onChange({
      signatures: next,
      ...(sigs.length ? {} : { signatureNew: id, signatureReply: id }),
    });
    setEditingId(id);
    setName(next[next.length - 1].name);
    htmlRef.current = '';
  };

  const removeSignature = () => {
    if (!editing) return;
    clearTimeout(timer.current);
    pending.current = null;
    const rest = sigs.filter((s) => s.id !== editing.id);
    onChange({
      signatures: rest,
      signatureNew: prefs.signatureNew === editing.id ? '' : prefs.signatureNew,
      signatureReply: prefs.signatureReply === editing.id ? '' : prefs.signatureReply,
    });
    if (rest[0]) select(rest[0]);
    else {
      setEditingId(null);
      setName('');
      htmlRef.current = '';
    }
  };

  const options = [{ id: NONE, label: 'Ingen signatur' }, ...sigs.map((s) => ({ id: s.id, label: s.name }))];

  return (
    <View>
      <Text style={styles.kicker}>Signaturer</Text>
      <Text style={styles.hint}>
        Lim inn signaturen din fra Outlook: åpne en e-post du har sendt (her i ProTop eller i Outlook på nett),
        merk signaturen, kopier og lim inn i feltet under. Logo og bilder kan også legges inn med «Sett inn bilde».
      </Text>

      <View style={styles.sigTabs}>
        {sigs.map((s) => (
          <TouchableOpacity
            key={s.id}
            onPress={() => select(s)}
            style={[styles.sigTab, s.id === editingId && styles.sigTabOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: s.id === editingId }}
          >
            <Text style={[styles.sigTabTxt, s.id === editingId && styles.sigTabTxtOn]} numberOfLines={1}>{s.name}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={addSignature} style={styles.addBtn} accessibilityRole="button">
          <Ionicons name="add" size={14} color={colors.brand} />
          <Text style={styles.addTxt}>Ny signatur</Text>
        </TouchableOpacity>
      </View>

      {editing ? (
        <View style={styles.editor}>
          <View style={styles.nameRow}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(v) => {
                setName(v);
                schedule({ name: v.trim() || 'Signatur', html: htmlRef.current }, 500);
              }}
              placeholder="Navn på signaturen"
              placeholderTextColor={colors.placeholder}
            />
            <TouchableOpacity onPress={removeSignature} accessibilityRole="button" accessibilityLabel="Slett signaturen">
              <Text style={styles.linkDanger}>Slett</Text>
            </TouchableOpacity>
          </View>
          <MailRichEditor
            key={editing.id}
            initialHtml={editing.html}
            placeholder="Lim inn eller skriv signaturen her…"
            fontFamily={prefs.fontFamily}
            fontSize={prefs.fontSize}
            minHeight={160}
            onChange={(html) => {
              htmlRef.current = html;
              schedule({ name: name.trim() || 'Signatur', html }, 700);
            }}
          />
          {Platform.OS !== 'web' ? (
            <Text style={styles.hint}>Signaturer med bilder redigeres best på PC.</Text>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.hint, { marginTop: 8 }]}>Ingen signaturer ennå.</Text>
      )}

      <Text style={[styles.optionLbl, { marginTop: 14 }]}>Nye meldinger</Text>
      <OptionPicker
        options={options}
        value={prefs.signatureNew || NONE}
        onChange={(id) => onChange({ signatureNew: id === NONE ? '' : id })}
        title="Signatur for nye meldinger"
        clearable={false}
      />
      <Text style={[styles.optionLbl, { marginTop: 10 }]}>Svar og videresending</Text>
      <OptionPicker
        options={options}
        value={prefs.signatureReply || NONE}
        onChange={(id) => onChange({ signatureReply: id === NONE ? '' : id })}
        title="Signatur for svar og videresending"
        clearable={false}
      />

      <Text style={[styles.kicker, { marginTop: 18 }]}>Skriving</Text>
      <Text style={styles.optionLbl}>Standard skrifttype</Text>
      <OptionPicker
        options={MAIL_FONTS.map((font) => ({ id: font.value, label: font.label }))}
        value={prefs.fontFamily}
        onChange={(fontFamily) => { if (fontFamily) onChange({ fontFamily }); }}
        title="Skrifttype"
        clearable={false}
      />
      <Text style={[styles.optionLbl, { marginTop: 10 }]}>Standard skriftstørrelse</Text>
      <OptionPicker
        options={MAIL_PREF_FONT_SIZES.map((size) => ({ id: size, label: `${size} pt` }))}
        value={prefs.fontSize}
        onChange={(fontSize) => { if (fontSize !== '') onChange({ fontSize }); }}
        title="Skriftstørrelse"
        clearable={false}
      />
      <View style={styles.optionRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.optionLbl}>Vis blindkopi som standard</Text>
        </View>
        <BrandToggle value={!!prefs.showBcc} onValueChange={(showBcc) => onChange({ showBcc })} />
      </View>
      <View style={styles.optionRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.optionLbl}>Be om lesekvittering som standard</Text>
          <Text style={styles.hint}>Mottakers e-postprogram avgjør om kvittering sendes.</Text>
        </View>
        <BrandToggle value={!!prefs.readReceipt} onValueChange={(readReceipt) => onChange({ readReceipt })} />
      </View>

      <Text style={[styles.kicker, { marginTop: 18 }]}>Lesing</Text>
      <View style={styles.optionRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.optionLbl}>Merk som lest når meldingen åpnes</Text>
          <Text style={styles.hint}>Slå av for å merke som lest selv (Ctrl+Q).</Text>
        </View>
        <BrandToggle value={prefs.markReadOnOpen !== false} onValueChange={(markReadOnOpen) => onChange({ markReadOnOpen })} />
      </View>
      <View style={styles.optionRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.optionLbl}>Kompakt meldingsliste</Text>
          <Text style={styles.hint}>Flere meldinger på skjermen, uten forhåndsvisning.</Text>
        </View>
        <BrandToggle value={!!prefs.compactList} onValueChange={(compactList) => onChange({ compactList })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: 11, color: colors.muted, letterSpacing: 0.42,
    textTransform: 'uppercase', marginBottom: 6, marginTop: 18,
  },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  optionLbl: { fontSize: 13, fontWeight: '500', color: colors.ink, marginBottom: 4 },
  sigTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  sigTab: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, borderWidth: 1, borderColor: colors.line, maxWidth: 200,
  },
  sigTabOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  sigTabTxt: { fontSize: 12, color: colors.ink },
  sigTabTxtOn: { color: colors.brand },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6 },
  addTxt: { fontSize: 12, color: colors.brand },
  editor: { marginTop: 10, gap: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: {
    flex: 1, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10, paddingVertical: 7,
    fontSize: 13, color: colors.ink, borderRadius: 4,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  linkDanger: { color: colors.danger, fontSize: 12 },
});
