/**
 * Formatert nyhetstekst: visning og redigering med verktøylinje.
 * Markeringen (## underoverskrift, **fet**, *kursiv*, __understrek__, lister) tolkes i
 * src/project/newsFormat.js, så web og mobil viser det samme.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Platform,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import { radius, space, touch, type } from '../../src/ui/tokens';
import { useTitleRef } from '../mail/useDomHover';
import {
  BLOCK_KINDS, continueList, parseNewsBody, toggleBlock, toggleInline,
} from '../../src/project/newsFormat';

function Inline({ segments }) {
  return segments.map((seg, i) => (
    <Text
      key={i}
      style={[
        seg.bold && styles.bold,
        seg.italic && styles.italic,
        seg.underline && styles.underline,
      ]}
    >
      {seg.text}
    </Text>
  ));
}

/** Viser nyhetsteksten med underoverskrifter, fet/kursiv/understrek og lister. */
export default function NewsBody({ text }) {
  const colors = useColors();
  const blocks = useMemo(() => parseNewsBody(text), [text]);
  if (!blocks.length) return null;
  const base = [styles.text, { color: colors.ink }];
  return (
    <View style={styles.body}>
      {blocks.map((block, i) => {
        if (block.type === 'h') {
          return (
            <Text key={i} accessibilityRole="header" style={[styles.heading, { color: colors.ink }, i > 0 && styles.headingGap]}>
              <Inline segments={block.inline} />
            </Text>
          );
        }
        if (block.type === 'list') {
          return (
            <View key={i} style={styles.list}>
              {block.items.map((item, j) => (
                <View key={j} style={styles.item}>
                  <Text style={[base, block.ordered ? styles.number : styles.bullet, { color: colors.muted }]}>
                    {block.ordered ? `${item.number}.` : '•'}
                  </Text>
                  <Text style={[base, styles.itemText]}><Inline segments={item.inline} /></Text>
                </View>
              ))}
            </View>
          );
        }
        return <Text key={i} style={base}><Inline segments={block.inline} /></Text>;
      })}
    </View>
  );
}

const SHORTCUT = Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
  ? '⌘'
  : 'Ctrl+';

const TOOLS = [
  { kind: 'heading', icon: 'format-header-2', label: 'Underoverskrift' },
  { kind: 'bold', icon: 'format-bold', label: 'Fet', key: 'b' },
  { kind: 'italic', icon: 'format-italic', label: 'Kursiv', key: 'i' },
  { kind: 'underline', icon: 'format-underline', label: 'Understrek', key: 'u' },
  { kind: 'bullet', icon: 'format-list-bulleted', label: 'Punktliste' },
  { kind: 'number', icon: 'format-list-numbered', label: 'Nummerert liste' },
];
const GROUP_END = new Set(['heading', 'underline']);
const KEY_KIND = Object.fromEntries(TOOLS.filter((t) => t.key).map((t) => [t.key, t.kind]));

function ToolButton({
  icon, label, hint, text, onPress, colors, size, active,
}) {
  const titleRef = useTitleRef(hint || label);
  return (
    <Pressable
      ref={titleRef}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active != null ? { selected: active } : undefined}
      style={({ hovered, pressed }) => [
        styles.tool,
        { minWidth: size, height: size },
        text ? styles.toolWithText : null,
        (hovered || pressed) && { backgroundColor: colors.sunken },
        active && { backgroundColor: colors.brandSoft },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={active ? colors.brandInk : colors.ink} />
      {text ? <Text style={[styles.toolText, { color: active ? colors.brandInk : colors.ink }]}>{text}</Text> : null}
    </Pressable>
  );
}

/**
 * Tekstfelt for nyheter med verktøylinje: underoverskrift, fet, kursiv, understrek og lister.
 * Ctrl/⌘+B, I og U på web. Enter i en liste lager neste punkt. Forhåndsvis viser resultatet.
 */
export function NewsBodyEditor({
  value, onChangeText, placeholder, title, minHeight = 160, maxHeight = 420,
}) {
  const colors = useColors();
  const { isPhone, isDesktop, isTouch } = useLayout();
  const web = Platform.OS === 'web';
  const inputRef = useRef(null);
  const selRef = useRef({ start: 0, end: 0 });
  const [preview, setPreview] = useState(false);
  const [height, setHeight] = useState(minHeight);
  const text = String(value || '');
  const compact = isPhone;
  const size = isTouch ? touch.min : 34;

  const readSelection = useCallback(() => {
    const node = inputRef.current;
    // På web husker feltet utvalget også etter at en knapp har tatt fokus.
    if (web && typeof node?.selectionStart === 'number') return { start: node.selectionStart, end: node.selectionEnd };
    return selRef.current;
  }, [web]);

  const apply = useCallback((next) => {
    onChangeText(next.text);
    selRef.current = { start: next.start, end: next.end };
    setTimeout(() => {
      const node = inputRef.current;
      if (!node) return;
      node.focus?.();
      if (web) node.setSelectionRange?.(next.start, next.end);
      else node.setSelection?.(next.start, next.end);
    }, 0);
  }, [onChangeText, web]);

  const format = useCallback((kind) => {
    const { start, end } = readSelection();
    apply(BLOCK_KINDS.includes(kind) ? toggleBlock(text, start, end, kind) : toggleInline(text, start, end, kind));
  }, [apply, readSelection, text]);

  const handleChange = useCallback((next) => {
    const list = continueList(text, next);
    if (list) apply({ text: list.text, start: list.caret, end: list.caret });
    else onChangeText(next);
  }, [apply, onChangeText, text]);

  const handleKey = useCallback((event) => {
    const e = event?.nativeEvent || {};
    const mod = event?.ctrlKey || event?.metaKey || e.ctrlKey || e.metaKey;
    if (!mod || event?.altKey || event?.shiftKey) return;
    const kind = KEY_KIND[String(event?.key || e.key || '').toLowerCase()];
    if (!kind) return;
    event.preventDefault?.();
    format(kind);
  }, [format]);

  const grow = useCallback((event) => {
    const h = event?.nativeEvent?.contentSize?.height;
    if (!h) return;
    const next = Math.max(minHeight, Math.min(maxHeight, Math.ceil(h) + (web ? 2 : space.lg)));
    setHeight((cur) => (Math.abs(cur - next) > 1 ? next : cur));
  }, [maxHeight, minHeight, web]);

  const frame = { borderColor: colors.line };
  return (
    <View style={styles.editor}>
      <View style={[styles.toolbar, frame, { backgroundColor: colors.card }]}>
        {!preview ? TOOLS.map((tool) => (
          <React.Fragment key={tool.kind}>
            <ToolButton
              icon={tool.icon}
              label={tool.label}
              hint={tool.key && web ? `${tool.label} (${SHORTCUT}${tool.key.toUpperCase()})` : tool.label}
              text={tool.kind === 'heading' && !compact ? tool.label : null}
              onPress={() => format(tool.kind)}
              colors={colors}
              size={size}
            />
            {GROUP_END.has(tool.kind) && !compact ? <View style={[styles.divider, { backgroundColor: colors.line }]} /> : null}
          </React.Fragment>
        )) : null}
        <View style={styles.spacer} />
        <ToolButton
          key={preview ? 'edit' : 'preview'}
          icon={preview ? 'pencil-outline' : 'eye-outline'}
          label={preview ? 'Rediger tekst' : 'Forhåndsvis'}
          text={compact ? null : (preview ? 'Rediger' : 'Forhåndsvis')}
          onPress={() => setPreview((on) => !on)}
          colors={colors}
          size={size}
          active={preview}
        />
      </View>
      {preview ? (
        <View style={[styles.preview, frame, { minHeight: height, backgroundColor: colors.sunken }]}>
          {title?.trim() ? <Text style={[styles.previewTitle, { color: colors.ink }]}>{title.trim()}</Text> : null}
          {text.trim()
            ? <NewsBody text={text} />
            : <Text style={[styles.text, { color: colors.muted }]}>Ingen tekst ennå.</Text>}
        </View>
      ) : (
        <TextInput
          ref={inputRef}
          style={[styles.input, frame, { height, color: colors.ink, backgroundColor: colors.sunken }]}
          value={text}
          onChangeText={handleChange}
          onSelectionChange={(e) => { selRef.current = e.nativeEvent.selection; }}
          onKeyPress={web ? handleKey : undefined}
          onContentSizeChange={grow}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          multiline
          textAlignVertical="top"
        />
      )}
      {!preview && isDesktop && web ? (
        <Text style={[styles.hint, { color: colors.muted }]}>
          Marker tekst og velg format, eller bruk {SHORTCUT}B, {SHORTCUT}I og {SHORTCUT}U. Enter i en liste gir nytt punkt.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.xs },
  text: { fontSize: 15, lineHeight: 22 },
  heading: { ...type.title },
  headingGap: { marginTop: space.xxs },
  bold: { fontWeight: '600' },
  italic: { fontStyle: 'italic' },
  underline: { textDecorationLine: 'underline' },
  list: { gap: space.xxs },
  item: { flexDirection: 'row', gap: space.xs, paddingLeft: space.xxs },
  bullet: { minWidth: 10 },
  number: { minWidth: 20, fontVariant: ['tabular-nums'] },
  itemText: { flex: 1 },
  editor: { marginTop: space.xs },
  toolbar: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    borderWidth: 1, borderBottomWidth: 0,
    borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card,
    paddingHorizontal: space.xxs, paddingVertical: space.xxs,
  },
  tool: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xxs,
    borderRadius: radius.control, paddingHorizontal: 6,
  },
  toolWithText: { paddingHorizontal: space.xs },
  toolText: { ...type.label },
  divider: { width: 1, height: 20, marginHorizontal: space.xxs },
  spacer: { flexGrow: 1 },
  input: {
    borderWidth: 1,
    borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card,
    paddingHorizontal: space.sm, paddingVertical: 10, fontSize: 16, lineHeight: 22,
  },
  preview: {
    borderWidth: 1, gap: space.xs,
    borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card,
    paddingHorizontal: space.sm, paddingVertical: 10,
  },
  previewTitle: { fontSize: 16, fontWeight: '600', lineHeight: 21 },
  hint: { ...type.caption, marginTop: 6 },
});
