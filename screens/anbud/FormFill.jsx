import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hasDocInfo, isAnswerField } from '../../src/anbud/formBuilder';
import { filledProgress, setFilledValue } from '../../src/forms/filledDocs';
import { FOCUS_FIELD_BG, FOCUS_FIELD_BORDER, FOCUS_FIELD_INK } from '../../src/forms/highlight';
import { formWithTokens } from '../../src/forms/tokens';
import { fileToDataUrl } from '../../src/anbud/intakeClient';
import { pickDocument, pickImage } from '../../src/utils/media';
import FormAnswer from './FormAnswer';
import { formPrintHtml, printForm } from './formPrint';

function sectionsOf(fields) {
  const sections = [];
  let current = { title: null, items: [] };
  (fields || []).forEach((field) => {
    if (field.kind === 'title') {
      if (current.title || current.items.length) sections.push(current);
      current = { title: field, items: [] };
      return;
    }
    current.items.push(field);
  });
  if (current.title || current.items.length) sections.push(current);
  return sections;
}

function rowsOf(items) {
  const rows = [];
  for (let i = 0; i < items.length; i += 1) {
    const next = items[i + 1];
    if (next && items[i].width === 'half' && next.width === 'half' && isAnswerField(items[i]) && isAnswerField(next) && items[i].kind !== 'table' && next.kind !== 'table') {
      rows.push([items[i], next]);
      i += 1;
    } else rows.push([items[i]]);
  }
  return rows;
}

function sameText(left, right) {
  return String(left || '').trim().toLocaleLowerCase('nb-NO') === String(right || '').trim().toLocaleLowerCase('nb-NO');
}

function stamp(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function LivePreview({ doc, logo, company, colors, locked }) {
  if (Platform.OS !== 'web') return null;
  return (
    <View style={[styles.preview, { borderLeftColor: colors.line, backgroundColor: colors.sunken }]}>
      <Text style={[styles.kicker, { color: colors.muted }]}>PDF</Text>
      <View style={styles.previewFrame}>
        {React.createElement('iframe', {
          title: 'PDF-forhåndsvisning',
          srcDoc: formPrintHtml(doc, logo, { preview: true, company, highlight: !locked }),
          style: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%', border: 0, backgroundColor: '#e6ebf1', borderRadius: 8 },
        })}
      </View>
    </View>
  );
}

export default function FormFill({
  doc,
  colors,
  company = null,
  logo = '',
  actor = null,
  busy = false,
  note = '',
  noteBad = false,
  onChange,
  onSave,
  onComplete,
  onReopen,
  onDelete,
  onBack,
  backLabel = 'Tilbake',
  fill = false,
}) {
  const [width, setWidth] = useState(() => (Platform.OS === 'web' && typeof window !== 'undefined' ? window.innerWidth : 800));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickNote, setPickNote] = useState('');
  const locked = doc.status === 'ferdig';
  const shown = useMemo(() => formWithTokens(doc, company || {}), [doc, company]);
  const progress = filledProgress(doc);
  const wide = width >= 1100;
  const sections = sectionsOf(shown.fields);
  const missingRequired = progress.missing.length;

  function change(fieldId, value) {
    onChange(setFilledValue(doc, fieldId, value, { actor }));
  }

  async function pickFile(field) {
    try {
      const picked = field.kind === 'image' ? await pickImage({ edit: false }) : await pickDocument({});
      const file = Array.isArray(picked) ? picked[0] : picked;
      if (!file) return;
      const dataUrl = await fileToDataUrl(file);
      if (!dataUrl || dataUrl.length > 700000) {
        setPickNote(dataUrl ? 'Filen er for stor. Maks omtrent 500 kB.' : 'Kunne ikke lese filen.');
        return;
      }
      setPickNote('');
      change(field.id, { name: file.name || (field.kind === 'image' ? 'bilde.jpg' : 'vedlegg'), mimeType: file.mimeType || '', dataUrl });
    } catch (err) {
      setPickNote(err?.message || 'Kunne ikke lese filen.');
    }
  }

  const form = (
    <View style={styles.paper}>
      {hasDocInfo(shown.doc) ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {[shown.doc.docId, shown.doc.version ? `versjon ${shown.doc.version}` : '', shown.doc.system].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      <Text style={[styles.title, { color: colors.ink }]}>{shown.title}</Text>
      {shown.intro ? <Text style={{ color: colors.muted, lineHeight: 20 }}>{shown.intro}</Text> : null}
      {!locked ? (
        <View style={[styles.banner, { backgroundColor: FOCUS_FIELD_BG, borderColor: FOCUS_FIELD_BORDER }]}>
          <Text style={{ color: FOCUS_FIELD_INK }}>
            Lyse gule felt skal fylles ut. Felt med * må fylles ut før dokumentet kan merkes ferdig.
          </Text>
        </View>
      ) : (
        <View style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={{ color: colors.ink }}>
            Ferdig {stamp(doc.completedAt)}{doc.completedBy?.name ? ` av ${doc.completedBy.name}` : ''}. Gjenåpne for å endre.
          </Text>
        </View>
      )}
      {sections.map((section) => (
        <View key={section.title?.id || `del-${section.items[0]?.id || 'tom'}`} style={{ gap: 10 }}>
          {section.title ? (
            <Text style={[styles.section, { color: '#14283f', backgroundColor: '#dce6f1' }]}>{section.title.label}</Text>
          ) : null}
          {rowsOf(section.items).map((row) => (
            <View key={row.map((item) => item.id).join('-')} style={row.length > 1 ? styles.pair : undefined}>
              {row.map((field) => (
                <View key={field.id} style={row.length > 1 ? styles.pairItem : undefined}>
                  <FormAnswer
                    field={locked && isAnswerField(field) ? { ...field, editor: 'fast' } : field}
                    colors={colors}
                    variant="document"
                    signer={actor}
                    highlight={!locked}
                    onChange={(value) => change(field.id, value)}
                    onPickFile={pickFile}
                    caption={!(field.kind === 'table' && section.title && sameText(section.title.label, field.label))}
                  />
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.root, fill && { flex: 1, minHeight: 0 }]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={[styles.toolbar, { borderBottomColor: colors.line, backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>{backLabel}</Text>
        </TouchableOpacity>
        <View style={styles.row}>
          <View style={[styles.status, { backgroundColor: locked ? '#e7f6ec' : colors.sunken }]}>
            <Text style={{ color: locked ? '#1d7a3e' : colors.ink, fontSize: 12, fontWeight: '600' }}>
              {locked ? 'Ferdig' : `${progress.filled} av ${progress.total} felt`}
            </Text>
          </View>
          <TouchableOpacity onPress={() => printForm(doc, logo, { company, highlight: !locked })} accessibilityRole="button" accessibilityLabel="Skriv ut eller lagre PDF">
            <Text style={{ color: colors.brand }}>PDF</Text>
          </TouchableOpacity>
          {locked ? (
            <TouchableOpacity onPress={onReopen} disabled={busy} accessibilityRole="button" style={[styles.button, { borderColor: colors.brand }]}>
              <Text style={{ color: colors.brand }}>Gjenåpne</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity onPress={onSave} disabled={busy} accessibilityRole="button" style={[styles.button, { borderColor: colors.brand }]}>
                <Text style={{ color: colors.brand }}>{busy ? 'Lagrer …' : 'Lagre'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onComplete} disabled={busy} accessibilityRole="button" style={[styles.button, { backgroundColor: colors.brand, borderColor: colors.brand }]}>
                <Text style={{ color: '#fff' }}>Ferdig</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
      {!locked && missingRequired ? (
        <Text style={{ color: FOCUS_FIELD_INK, marginHorizontal: 16, marginTop: 8 }}>
          {missingRequired} obligatoriske felt gjenstår.
        </Text>
      ) : null}
      {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand, marginHorizontal: 16, marginTop: 8 }}>{note}</Text>}
      {!!pickNote && <Text style={{ color: colors.danger, marginHorizontal: 16, marginTop: 8 }}>{pickNote}</Text>}
      <View style={[styles.work, wide && { flexDirection: 'row' }]}>
        <ScrollView style={{ flex: 1, minWidth: 0 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {form}
          {onDelete ? (
            <View style={styles.deleteRow}>
              {confirmDelete ? (
                <>
                  <Text style={{ color: colors.ink }}>Slette dokumentet for godt?</Text>
                  <TouchableOpacity onPress={onDelete} accessibilityRole="button">
                    <Text style={{ color: colors.danger, fontWeight: '700' }}>Slett nå</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setConfirmDelete(false)} accessibilityRole="button">
                    <Text style={{ color: colors.muted }}>Avbryt</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity onPress={() => setConfirmDelete(true)} accessibilityRole="button">
                  <Text style={{ color: colors.danger }}>Slett dokumentet</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </ScrollView>
        {wide ? <LivePreview doc={doc} logo={logo} company={company} colors={colors} locked={locked} /> : null}
      </View>
    </View>
  );
}

export function FilledStatusIcon({ status, colors }) {
  const done = status === 'ferdig';
  return <Ionicons name={done ? 'checkmark-circle' : 'create-outline'} size={16} color={done ? '#1d7a3e' : colors.muted} />;
}

const styles = StyleSheet.create({
  root: { position: 'relative', minHeight: 560 },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  status: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  button: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  work: { flex: 1, minHeight: 0 },
  scroll: { padding: 16, paddingBottom: 64 },
  paper: { width: '100%', maxWidth: 860, alignSelf: 'center', gap: 14 },
  title: { fontSize: 26, fontWeight: '300', color: '#1f3b5c' },
  banner: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  section: { fontSize: 14, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 4, overflow: 'hidden' },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' },
  pairItem: { flexGrow: 1, flexBasis: 260, minWidth: 220 },
  preview: { width: '44%', minWidth: 420, padding: 12, gap: 6, borderLeftWidth: 1 },
  previewFrame: { flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' },
  kicker: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  deleteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'center', maxWidth: 860, alignSelf: 'center', width: '100%', marginTop: 24 },
});
