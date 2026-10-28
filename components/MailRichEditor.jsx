import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import {
  Platform, View, Text, TextInput, Pressable, StyleSheet,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors } from '../src/theme';
import { wrapPlainSelection } from '../src/utils/mailHtml';
import { stripForeignStyles } from '../src/utils/mailModel';
import { sanitizeInlineHtml } from '../src/utils/sanitizeHtml';
import { MAIL_FONTS } from '../src/utils/mailSignature';
import { MailMenu, useMenuAnchor } from './mail/MailMenu';
import { useTitleRef } from './mail/useDomHover';

export const EDITOR_FONTS = [
  ...MAIL_FONTS,
  { id: 'tahoma', label: 'Tahoma', value: 'Tahoma, Verdana, sans-serif' },
  { id: 'times', label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { id: 'courier', label: 'Courier New', value: '"Courier New", Courier, monospace' },
];
export const EDITOR_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];
const TEXT_COLORS = [
  '#000000', '#1a2744', '#5b6b82', '#9aa5b5', '#ffffff',
  '#c00000', '#e3424a', '#f2853d', '#e8b500', '#3fa45b',
  '#20a39e', '#2f80ed', '#1a237e', '#8e6ac8', '#c2185b',
];
const HIGHLIGHTS = ['#fff59d', '#c5f1c5', '#bde3ff', '#ffd3e0', '#ffe0b2', '#e0e0e0', 'transparent'];

const EDITOR_CSS = `
.protop-mail-editor:empty:before{content:attr(data-placeholder);color:#9aa5b5;pointer-events:none}
.protop-mail-editor p{margin:0}
.protop-mail-editor img{max-width:100%;height:auto}
.protop-mail-editor blockquote{margin:0 0 0 6px;padding-left:10px;border-left:2px solid #d0d7e2}
.protop-mail-editor table{border-collapse:collapse}
.protop-mail-editor a{color:#0f6cbd}
.protop-mail-editor ul,.protop-mail-editor ol{margin:0;padding-left:28px}
`;

function ensureEditorCss() {
  if (typeof document === 'undefined' || document.getElementById('protop-mail-editor-css')) return;
  const el = document.createElement('style');
  el.id = 'protop-mail-editor-css';
  el.textContent = EDITOR_CSS;
  document.head.appendChild(el);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Store skjermbilder skaleres ned, så meldingen ikke blir unødig tung. */
function shrinkImage(dataUrl, maxWidth = 1600) {
  if (typeof document === 'undefined' || dataUrl.length < 600000) return Promise.resolve(dataUrl);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(1, img.width));
      if (scale >= 1 && dataUrl.length < 1500000) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(/png/i.test(dataUrl.slice(0, 30)) ? 'image/png' : 'image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function escapeAttr(v) {
  return String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function FmtBtn({ icon, label, onPress, active, innerRef, chevron }) {
  const ref = useTitleRef(label, innerRef);
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ hovered }) => [styles.tool, chevron && styles.toolWide, (hovered || active) && styles.toolOn]}
    >
      <MaterialCommunityIcons name={icon} size={17} color={active ? colors.brand : colors.ink} />
      {chevron ? <MaterialCommunityIcons name="menu-down" size={14} color={colors.muted} /> : null}
    </Pressable>
  );
}

function TextDrop({ label, value, width, onPress, innerRef }) {
  const ref = useTitleRef(label, innerRef);
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ hovered }) => [styles.drop, { width }, hovered && styles.toolOn]}
    >
      <Text style={styles.dropTxt} numberOfLines={1}>{value}</Text>
      <MaterialCommunityIcons name="menu-down" size={14} color={colors.muted} />
    </Pressable>
  );
}

function useMenu() {
  return useMenuAnchor();
}

/**
 * Formatert tekst som i Outlook. På web er det et contentEditable-felt med verktøylinje;
 * markeringen huskes når du trykker på en knapp, så formateringen treffer riktig tekst.
 * Ref: focus(), insertHtml(html), setSignature(html), getHtml().
 */
const MailRichEditor = forwardRef(function MailRichEditor({
  initialHtml,
  onChange,
  fontFamily,
  fontSize,
  placeholder = 'Skriv meldingen…',
  onFiles,
  onSubmitShortcut,
  onNotice,
  minHeight = 220,
  style,
}, ref) {
  const editorRef = useRef(null);
  const rangeRef = useRef(null);
  const fileRef = useRef(null);
  const [plain, setPlain] = useState(() => String(initialHtml || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' '));
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const [linkUrl, setLinkUrl] = useState('https://');
  const [curFont, setCurFont] = useState(() => EDITOR_FONTS.find((f) => f.value === fontFamily)?.label || 'Calibri');
  const [curSize, setCurSize] = useState(Number(fontSize) || 11);
  const fontMenu = useMenu();
  const sizeMenu = useMenu();
  const colorMenu = useMenu();
  const hiliteMenu = useMenu();
  const alignMenu = useMenu();
  const tableMenu = useMenu();
  const linkMenu = useMenu();

  const web = Platform.OS === 'web';

  useEffect(() => {
    if (!web) return;
    ensureEditorCss();
    const el = editorRef.current;
    // Utkast fra Outlook kan inneholde videresendt e-post. Feltet er en del av appen (ingen sandkasse),
    // så HTML-en renses som signaturen før den settes inn.
    if (el) el.innerHTML = sanitizeInlineHtml(initialHtml || '');
    // Bare ved oppstart; videre redigering eies av feltet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!web || typeof document === 'undefined') return undefined;
    const onSel = () => {
      const el = editorRef.current;
      const s = document.getSelection();
      if (!el || !s || !s.rangeCount) return;
      const r = s.getRangeAt(0);
      if (el.contains(r.commonAncestorContainer)) rangeRef.current = r.cloneRange();
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [web]);

  const emit = useCallback(() => {
    onChange?.(editorRef.current?.innerHTML || '');
  }, [onChange]);

  const restore = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const s = document.getSelection();
    if (rangeRef.current && s) {
      s.removeAllRanges();
      s.addRange(rangeRef.current);
    } else if (s) {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      s.removeAllRanges();
      s.addRange(r);
    }
  }, []);

  const exec = useCallback((cmd, value, { css = true } = {}) => {
    if (!web || typeof document === 'undefined') return;
    restore();
    try { document.execCommand('styleWithCSS', false, css); } catch { /* eldre nettlesere */ }
    document.execCommand(cmd, false, value);
    emit();
  }, [web, restore, emit]);

  const insertHtml = useCallback((html) => {
    if (!web) return;
    restore();
    document.execCommand('insertHTML', false, html);
    emit();
  }, [web, restore, emit]);

  const applySize = (pt) => {
    setCurSize(pt);
    exec('fontSize', '7', { css: false });
    const el = editorRef.current;
    el?.querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement('span');
      span.style.fontSize = `${pt}pt`;
      while (f.firstChild) span.appendChild(f.firstChild);
      f.replaceWith(span);
    });
    emit();
  };

  const applyFont = (font) => {
    setCurFont(font.label);
    exec('fontName', font.value);
  };

  const insertImageFile = async (file) => {
    const raw = await readFileAsDataUrl(file);
    const url = await shrinkImage(raw);
    insertHtml(`<img src="${escapeAttr(url)}" alt="" style="max-width:100%">`);
  };

  const pickImage = () => {
    if (!web) return;
    fileRef.current?.click();
  };

  const onPaste = (e) => {
    const data = e.clipboardData;
    if (!data) return;
    const files = [...(data.files || [])];
    const html = data.getData('text/html');
    const images = files.filter((f) => /^image\//.test(f.type));
    if (images.length && !html) {
      e.preventDefault();
      images.forEach((f) => { insertImageFile(f).catch(() => {}); });
      return;
    }
    if (html) {
      e.preventDefault();
      let clean = stripForeignStyles(html)
        .replace(/<!--StartFragment-->|<!--EndFragment-->/g, '');
      if (/<img[^>]+src=["']file:/i.test(clean)) {
        clean = clean.replace(/<img[^>]+src=["']file:[^>]*>/gi, '');
        onNotice?.('Noen bilder kunne ikke limes inn fra Outlook. Legg dem inn med «Sett inn bilde».');
      }
      document.execCommand('insertHTML', false, sanitizeInlineHtml(clean));
      emit();
    }
  };

  const onDrop = (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    const images = files.filter((f) => /^image\//.test(f.type));
    const rest = files.filter((f) => !/^image\//.test(f.type));
    images.forEach((f) => { insertImageFile(f).catch(() => {}); });
    if (rest.length) onFiles?.(rest);
  };

  /** Klikk i tomt felt før noe er skrevet: markøren til toppen, ikke bak signaturen (som i Outlook). */
  const onClick = (e) => {
    const el = editorRef.current;
    if (!el || e.target !== el) return;
    const sig = el.querySelector('[data-wp-signature="1"]');
    if (!sig) return;
    for (const node of el.childNodes) {
      if (node === sig) break;
      if (String(node.textContent || '').trim() || node.querySelector?.('img,table')) return;
    }
    const first = el.firstChild && el.firstChild !== sig ? el.firstChild : null;
    const target = first || el;
    const s = document.getSelection();
    const r = document.createRange();
    r.setStart(target, 0);
    r.collapse(true);
    s?.removeAllRanges();
    s?.addRange(r);
  };

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      emit();
      onSubmitShortcut?.();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      linkMenu.open();
    }
  };

  const insertLink = () => {
    const url = String(linkUrl || '').trim();
    if (!url || url === 'https://') return;
    const href = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    const r = rangeRef.current;
    if (!r || r.collapsed) {
      insertHtml(`<a href="${escapeAttr(href)}">${escapeAttr(url)}</a>`);
    } else {
      exec('createLink', href);
    }
    setLinkUrl('https://');
  };

  const insertTable = (rows, cols) => {
    const cell = '<td style="border:1px solid #c8d0dc;padding:4px 8px;min-width:60px">&nbsp;</td>';
    const body = Array.from({ length: rows }, () => `<tr>${cell.repeat(cols)}</tr>`).join('');
    insertHtml(`<table style="border-collapse:collapse;width:100%">${body}</table><div><br></div>`);
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      if (!web) return;
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const s = document.getSelection();
      const r = document.createRange();
      const first = el.firstChild && el.firstChild.nodeType === 1 && !el.firstChild.matches?.('[data-wp-signature="1"]')
        ? el.firstChild
        : el;
      r.setStart(first, 0);
      r.collapse(true);
      s?.removeAllRanges();
      s?.addRange(r);
    },
    insertHtml,
    getHtml: () => (web ? editorRef.current?.innerHTML || '' : plain),
    setSignature: (html) => {
      if (!web) return;
      const el = editorRef.current;
      if (!el) return;
      const existing = el.querySelector('[data-wp-signature="1"]');
      const safe = sanitizeInlineHtml(html);
      if (!safe) {
        existing?.remove();
      } else if (existing) {
        existing.outerHTML = safe;
      } else {
        el.insertAdjacentHTML('beforeend', safe);
      }
      emit();
    },
  }), [web, insertHtml, emit, plain]);

  const nativeWrap = (kind) => {
    const next = wrapPlainSelection(plain, sel.start, sel.end, kind);
    setPlain(next.text);
    setSel({ start: next.start, end: next.end });
    onChange?.(next.text);
  };

  if (!web) {
    return (
      <View style={[styles.wrap, style]}>
        <View style={styles.toolbar}>
          <FmtBtn icon="format-bold" label="Fet" onPress={() => nativeWrap('bold')} />
          <FmtBtn icon="format-italic" label="Kursiv" onPress={() => nativeWrap('italic')} />
          <FmtBtn icon="format-underline" label="Understrek" onPress={() => nativeWrap('underline')} />
          <FmtBtn icon="format-list-bulleted" label="Punktliste" onPress={() => nativeWrap('ul')} />
          <FmtBtn icon="format-list-numbered" label="Nummerert liste" onPress={() => nativeWrap('ol')} />
        </View>
        <TextInput
          style={[styles.nativeInput, { minHeight, fontFamily: undefined, fontSize: (Number(fontSize) || 11) + 3 }]}
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
      </View>
    );
  }

  const swatches = (list, onPick, close) => (
    <View style={styles.swatches}>
      {list.map((c) => (
        <Pressable
          key={c}
          onPress={() => { close(); onPick(c); }}
          accessibilityLabel={c === 'transparent' ? 'Ingen utheving' : `Farge ${c}`}
          style={[styles.swatch, { backgroundColor: c === 'transparent' ? '#fff' : c }, c === '#ffffff' && styles.swatchWhite]}
        >
          {c === 'transparent' ? <MaterialCommunityIcons name="close" size={12} color={colors.muted} /> : null}
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.toolbar}>
        <TextDrop innerRef={fontMenu.ref} label="Skrifttype" value={curFont} width={118} onPress={fontMenu.open} />
        <TextDrop innerRef={sizeMenu.ref} label="Skriftstørrelse" value={String(curSize)} width={48} onPress={sizeMenu.open} />
        <View style={styles.sep} />
        <FmtBtn icon="format-bold" label="Fet (Ctrl+B)" onPress={() => exec('bold')} />
        <FmtBtn icon="format-italic" label="Kursiv (Ctrl+I)" onPress={() => exec('italic')} />
        <FmtBtn icon="format-underline" label="Understrek (Ctrl+U)" onPress={() => exec('underline')} />
        <FmtBtn icon="format-strikethrough-variant" label="Gjennomstreking" onPress={() => exec('strikeThrough')} />
        <FmtBtn innerRef={colorMenu.ref} icon="format-color-text" label="Skriftfarge" onPress={colorMenu.open} chevron />
        <FmtBtn innerRef={hiliteMenu.ref} icon="format-color-highlight" label="Uthevingsfarge" onPress={hiliteMenu.open} chevron />
        <View style={styles.sep} />
        <FmtBtn icon="format-list-bulleted" label="Punktliste" onPress={() => exec('insertUnorderedList')} />
        <FmtBtn icon="format-list-numbered" label="Nummerert liste" onPress={() => exec('insertOrderedList')} />
        <FmtBtn icon="format-indent-decrease" label="Reduser innrykk" onPress={() => exec('outdent')} />
        <FmtBtn icon="format-indent-increase" label="Øk innrykk" onPress={() => exec('indent')} />
        <FmtBtn innerRef={alignMenu.ref} icon="format-align-left" label="Justering" onPress={alignMenu.open} chevron />
        <View style={styles.sep} />
        <FmtBtn innerRef={linkMenu.ref} icon="link-variant" label="Sett inn lenke (Ctrl+K)" onPress={linkMenu.open} />
        <FmtBtn icon="image-outline" label="Sett inn bilde" onPress={pickImage} />
        <FmtBtn innerRef={tableMenu.ref} icon="table" label="Sett inn tabell" onPress={tableMenu.open} />
        <FmtBtn icon="minus" label="Vannrett linje" onPress={() => exec('insertHorizontalRule')} />
        <FmtBtn icon="format-quote-close" label="Sitat" onPress={() => exec('formatBlock', 'BLOCKQUOTE')} />
        <FmtBtn icon="format-clear" label="Fjern formatering" onPress={() => { exec('removeFormat'); exec('unlink'); }} />
        <View style={styles.sep} />
        <FmtBtn icon="undo" label="Angre (Ctrl+Z)" onPress={() => exec('undo')} />
        <FmtBtn icon="redo" label="Gjør om (Ctrl+Y)" onPress={() => exec('redo')} />
      </View>

      <MailMenu
        visible={!!fontMenu.anchor}
        anchor={fontMenu.anchor}
        onClose={fontMenu.close}
        width={200}
        items={EDITOR_FONTS.map((f) => ({
          id: f.id, label: f.label, checked: f.label === curFont, onPress: () => applyFont(f),
        }))}
      />
      <MailMenu
        visible={!!sizeMenu.anchor}
        anchor={sizeMenu.anchor}
        onClose={sizeMenu.close}
        width={90}
        items={EDITOR_SIZES.map((s) => ({
          id: `s${s}`, label: String(s), checked: s === curSize, onPress: () => applySize(s),
        }))}
      />
      <MailMenu visible={!!colorMenu.anchor} anchor={colorMenu.anchor} onClose={colorMenu.close} width={176}>
        {colorMenu.anchor ? swatches(TEXT_COLORS, (c) => exec('foreColor', c), colorMenu.close) : null}
      </MailMenu>
      <MailMenu visible={!!hiliteMenu.anchor} anchor={hiliteMenu.anchor} onClose={hiliteMenu.close} width={176}>
        {hiliteMenu.anchor ? swatches(HIGHLIGHTS, (c) => {
          exec('hiliteColor', c);
        }, hiliteMenu.close) : null}
      </MailMenu>
      <MailMenu
        visible={!!alignMenu.anchor}
        anchor={alignMenu.anchor}
        onClose={alignMenu.close}
        width={170}
        items={[
          { id: 'l', label: 'Venstrejuster', icon: 'reorder-four-outline', onPress: () => exec('justifyLeft') },
          { id: 'c', label: 'Midtstill', icon: 'reorder-three-outline', onPress: () => exec('justifyCenter') },
          { id: 'r', label: 'Høyrejuster', icon: 'reorder-four-outline', onPress: () => exec('justifyRight') },
          { id: 'j', label: 'Blokkjuster', icon: 'menu-outline', onPress: () => exec('justifyFull') },
        ]}
      />
      <MailMenu
        visible={!!tableMenu.anchor}
        anchor={tableMenu.anchor}
        onClose={tableMenu.close}
        width={170}
        items={[[2, 2], [3, 3], [4, 3], [5, 4], [6, 2]].map(([r, c]) => ({
          id: `t${r}${c}`, label: `${c} × ${r} tabell`, icon: 'grid-outline', onPress: () => insertTable(r, c),
        }))}
      />
      <MailMenu visible={!!linkMenu.anchor} anchor={linkMenu.anchor} onClose={linkMenu.close} width={300}>
        {linkMenu.anchor ? (
          <View style={styles.linkBox}>
            <Text style={styles.linkLbl}>Lenke</Text>
            <TextInput
              style={styles.linkInput}
              value={linkUrl}
              onChangeText={setLinkUrl}
              autoFocus
              autoCapitalize="none"
              onSubmitEditing={() => { linkMenu.close(); insertLink(); }}
              placeholder="https://"
            />
            <View style={styles.linkRow}>
              <Pressable style={styles.linkBtn} onPress={() => { linkMenu.close(); insertLink(); }}>
                <Text style={styles.linkBtnTxt}>Sett inn</Text>
              </Pressable>
              <Pressable style={styles.linkBtnGhost} onPress={() => { linkMenu.close(); exec('unlink'); }}>
                <Text style={styles.linkGhostTxt}>Fjern lenke</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </MailMenu>

      {React.createElement('input', {
        ref: fileRef,
        type: 'file',
        accept: 'image/*',
        multiple: true,
        style: { display: 'none' },
        onChange: (e) => {
          [...(e.target.files || [])].forEach((f) => { insertImageFile(f).catch(() => {}); });
          e.target.value = '';
        },
      })}
      {React.createElement('div', {
        ref: editorRef,
        className: 'protop-mail-editor',
        contentEditable: true,
        suppressContentEditableWarning: true,
        role: 'textbox',
        'aria-multiline': true,
        'aria-label': placeholder,
        'data-placeholder': placeholder,
        spellCheck: true,
        onInput: emit,
        onBlur: emit,
        onPaste,
        onDrop,
        onKeyDown,
        onClick,
        style: {
          flex: 1,
          minHeight,
          overflowY: 'auto',
          padding: '12px 14px',
          outline: 'none',
          fontFamily: fontFamily || 'Calibri, "Segoe UI", Arial, sans-serif',
          fontSize: `${Number(fontSize) || 11}pt`,
          color: '#1a2744',
          background: '#fff',
          lineHeight: 1.4,
          wordBreak: 'break-word',
        },
      })}
    </View>
  );
});

export default MailRichEditor;

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
    minHeight: 240,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.sunken,
  },
  tool: {
    height: 28,
    minWidth: 28,
    paddingHorizontal: 4,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  toolWide: { paddingHorizontal: 2 },
  toolOn: { backgroundColor: colors.line },
  drop: {
    height: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: 3,
    paddingLeft: 6,
    paddingRight: 2,
    marginRight: 3,
  },
  dropTxt: { fontSize: 12, color: colors.ink, flexShrink: 1 },
  sep: { width: 1, height: 18, backgroundColor: colors.line, marginHorizontal: 4 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 10 },
  swatch: {
    width: 22, height: 22, borderRadius: 3, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
  },
  swatchWhite: { borderColor: colors.line },
  linkBox: { padding: 10, gap: 8 },
  linkLbl: { fontSize: 12, color: colors.muted },
  linkInput: {
    borderWidth: 1, borderColor: colors.line, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, color: colors.ink,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  linkRow: { flexDirection: 'row', gap: 8 },
  linkBtn: { backgroundColor: colors.brand, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4 },
  linkBtnTxt: { color: '#fff', fontSize: 12 },
  linkBtnGhost: { paddingHorizontal: 8, paddingVertical: 6 },
  linkGhostTxt: { color: colors.danger, fontSize: 12 },
  nativeInput: {
    minHeight: 180,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: 'top',
  },
});
