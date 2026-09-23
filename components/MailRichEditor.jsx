import React, { useEffect, useRef, useState } from 'react';
import {
  Platform, View, Text, TextInput, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import { wrapPlainSelection } from '../src/utils/mailHtml';

const COLORS = ['#1a2744', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed'];

function ToolBtn({ icon, label, onPress, active }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tool, active && styles.toolOn]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={15} color={active ? colors.brand : colors.ink} />
    </TouchableOpacity>
  );
}

function runWebCommand(editor, cmd, value) {
  if (typeof document === 'undefined' || !editor) return;
  editor.focus();
  document.execCommand(cmd, false, value);
}

export default function MailRichEditor({
  initialHtml,
  onChange,
  fontFamily,
  fontSize,
  placeholder = 'Skriv meldingen…',
}) {
  const editorRef = useRef(null);
  const seededRef = useRef(false);
  const [plain, setPlain] = useState(() => String(initialHtml || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' '));
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const [colorOpen, setColorOpen] = useState(false);

  useEffect(() => {
    seededRef.current = false;
  }, [initialHtml]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const el = editorRef.current;
    if (!el || seededRef.current) return undefined;
    el.innerHTML = initialHtml || '<div><br></div>';
    seededRef.current = true;
    return undefined;
  }, [initialHtml]);

  const emitWeb = () => {
    const html = editorRef.current?.innerHTML || '';
    onChange?.(html);
  };

  const webCmd = (cmd, value) => {
    runWebCommand(editorRef.current, cmd, value);
    emitWeb();
  };

  const nativeWrap = (kind) => {
    const next = wrapPlainSelection(plain, sel.start, sel.end, kind);
    setPlain(next.text);
    setSel({ start: next.start, end: next.end });
    onChange?.(next.text);
  };

  const addLink = () => {
    if (Platform.OS === 'web') {
      const url = typeof window !== 'undefined'
        ? window.prompt('Lenke (https://…)', 'https://')
        : '';
      if (url) webCmd('createLink', url);
      return;
    }
    nativeWrap('bold');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <ToolBtn icon="document-text-outline" label="Normal" onPress={() => (Platform.OS === 'web' ? webCmd('formatBlock', 'DIV') : null)} />
        <ToolBtn icon="bold" label="Fet" onPress={() => (Platform.OS === 'web' ? webCmd('bold') : nativeWrap('bold'))} />
        <ToolBtn icon="italic" label="Kursiv" onPress={() => (Platform.OS === 'web' ? webCmd('italic') : nativeWrap('italic'))} />
        <ToolBtn icon="underline" label="Understrek" onPress={() => (Platform.OS === 'web' ? webCmd('underline') : nativeWrap('underline'))} />
        <ToolBtn icon="text-outline" label="Gjennomstrek" onPress={() => (Platform.OS === 'web' ? webCmd('strikeThrough') : null)} />
        <View style={styles.sep} />
        <ToolBtn icon="list-outline" label="Punktliste" onPress={() => (Platform.OS === 'web' ? webCmd('insertUnorderedList') : nativeWrap('ul'))} />
        <ToolBtn icon="list" label="Nummerert liste" onPress={() => (Platform.OS === 'web' ? webCmd('insertOrderedList') : nativeWrap('ol'))} />
        <View style={styles.sep} />
        <ToolBtn icon="menu-outline" label="Venstrejuster" onPress={() => webCmd('justifyLeft')} />
        <ToolBtn icon="reorder-three-outline" label="Sentrer" onPress={() => webCmd('justifyCenter')} />
        <ToolBtn icon="menu" label="Høyrejuster" onPress={() => webCmd('justifyRight')} />
        <View style={styles.sep} />
        <ToolBtn icon="remove-outline" label="Mindre tekst" onPress={() => webCmd('fontSize', '2')} />
        <ToolBtn icon="add-outline" label="Større tekst" onPress={() => webCmd('fontSize', '5')} />
        <ToolBtn
          icon="color-palette-outline"
          label="Tekstfarge"
          active={colorOpen}
          onPress={() => setColorOpen((v) => !v)}
        />
        <ToolBtn icon="link-outline" label="Sett inn lenke" onPress={addLink} />
        <ToolBtn icon="chatbox-ellipses-outline" label="Sitat" onPress={() => webCmd('formatBlock', 'BLOCKQUOTE')} />
        <ToolBtn icon="close-circle-outline" label="Fjern formatering" onPress={() => webCmd('removeFormat')} />
      </View>
      {colorOpen ? (
        <View style={styles.colors}>
          {COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => {
                webCmd('foreColor', c);
                setColorOpen(false);
              }}
              style={[styles.swatch, { backgroundColor: c }]}
              accessibilityLabel={`Farge ${c}`}
            />
          ))}
        </View>
      ) : null}
      {Platform.OS === 'web' ? (
        React.createElement('div', {
          ref: editorRef,
          contentEditable: true,
          suppressContentEditableWarning: true,
          role: 'textbox',
          'aria-label': placeholder,
          onInput: emitWeb,
          onBlur: emitWeb,
          style: {
            minHeight: 200,
            maxHeight: 360,
            overflowY: 'auto',
            padding: 12,
            outline: 'none',
            fontFamily: fontFamily || 'Calibri, Segoe UI, Arial, sans-serif',
            fontSize: `${Number(fontSize) || 11}pt`,
            color: colors.ink,
            lineHeight: 1.45,
          },
        })
      ) : (
        <TextInput
          style={[styles.nativeInput, { fontFamily, fontSize: (Number(fontSize) || 11) + 3 }]}
          value={plain}
          onChangeText={(v) => {
            setPlain(v);
            onChange?.(v);
          }}
          onSelectionChange={(e) => setSel(e.nativeEvent.selection)}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          multiline
          textAlignVertical="top"
        />
      )}
      {Platform.OS !== 'web' ? (
        <Text style={styles.hint}>Fet, kursiv og lister settes inn som merker og vises formatert hos mottaker.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    minHeight: 240,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: '#f8fafc',
  },
  tool: {
    width: 28,
    height: 28,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolOn: { backgroundColor: colors.brandSoft },
  sep: { width: 1, height: 16, backgroundColor: colors.line, marginHorizontal: 4 },
  colors: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 8 },
  swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#fff' },
  nativeInput: {
    minHeight: 180,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  hint: { fontSize: 11, color: colors.muted, paddingHorizontal: 12, paddingBottom: 8 },
});
