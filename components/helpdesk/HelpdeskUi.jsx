/**
 * Felles byggesteiner for hjelpesenteret og helpdesk-portalen.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';
import {
  PRIORITIES, STATUSES, pickText, priorityLabel, statusLabel,
} from '../../src/helpdesk/model';
import { helpdeskCall } from '../../src/helpdesk/client';
import { attachmentsFromDataTransfer, pickAttachments } from '../../src/helpdesk/images';
import { diagnosticsSummary } from '../../src/helpdesk/triage';

export const HD = {
  brand: '#0b6bcb',
  brandSoft: '#e8f1fb',
  ink: colors.ink,
  muted: colors.muted,
  line: colors.line,
  card: colors.card,
  bg: colors.bg,
  sunken: colors.sunken,
  ok: '#15803d',
  okSoft: '#dcfce7',
  warn: '#b45309',
  warnSoft: '#fef3c7',
  danger: '#b91c1c',
  dangerSoft: '#fee2e2',
  info: '#1d4ed8',
  infoSoft: '#dbeafe',
  violet: '#6d28d9',
  violetSoft: '#ede9fe',
};

const TONES = {
  info: [HD.info, HD.infoSoft],
  warn: [HD.warn, HD.warnSoft],
  ok: [HD.ok, HD.okSoft],
  muted: ['#475569', '#e2e8f0'],
  danger: [HD.danger, HD.dangerSoft],
  violet: [HD.violet, HD.violetSoft],
};

export function Pill({ label, tone = 'muted', icon, small = false, testID }) {
  const [fg, bg] = TONES[tone] || TONES.muted;
  return (
    <View style={[s.pill, small && s.pillSmall, { backgroundColor: bg }]} testID={testID}>
      {icon ? <Ionicons name={icon} size={small ? 11 : 12} color={fg} /> : null}
      <Text style={[s.pillTxt, small && s.pillTxtSmall, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function StatusPill({ status, agent = false, lang = 'nb', small }) {
  const tone = (STATUSES[status] || STATUSES.open).tone;
  return <Pill label={statusLabel(status, { agent, lang })} tone={tone} small={small} testID={`status-${status}`} />;
}

const PRIORITY_TONE = { urgent: 'danger', high: 'warn', normal: 'muted', low: 'muted' };
const PRIORITY_ICON = { urgent: 'flame', high: 'arrow-up', normal: null, low: 'arrow-down' };

export function PriorityPill({ priority, lang = 'nb', small }) {
  if (!PRIORITIES[priority]) return null;
  return <Pill label={priorityLabel(priority, lang)} tone={PRIORITY_TONE[priority]} icon={PRIORITY_ICON[priority]} small={small} />;
}

export function Btn({
  label, onPress, icon, kind = 'primary', disabled, busy, small, testID, style, accessibilityLabel,
}) {
  const primary = kind === 'primary';
  const danger = kind === 'danger';
  const ghost = kind === 'ghost';
  const bg = primary ? HD.brand : danger ? HD.danger : ghost ? 'transparent' : HD.card;
  const fg = primary || danger ? '#fff' : HD.brand;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      testID={testID}
      style={[
        s.btn,
        small && s.btnSmall,
        { backgroundColor: bg, borderColor: primary ? HD.brand : danger ? HD.danger : ghost ? 'transparent' : HD.line },
        (disabled || busy) && { opacity: 0.55 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={small ? 15 : 17} color={fg} /> : null}
      {label ? <Text style={[s.btnTxt, small && s.btnTxtSmall, { color: fg }]} numberOfLines={1}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

export function Field({
  label, hint, value, onChangeText, placeholder, multiline, maxLength, testID, editable = true, keyboardType, autoFocus,
  onSubmitEditing, minHeight = 120, error, inputRef, secureTextEntry, autoComplete,
}) {
  return (
    <View style={s.field}>
      {label ? <Text style={s.fieldLabel}>{label}</Text> : null}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder || '#94a3b8'}
        multiline={multiline}
        maxLength={maxLength}
        editable={editable}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmitEditing}
        secureTextEntry={secureTextEntry}
        autoComplete={autoComplete}
        autoCapitalize={secureTextEntry || keyboardType === 'email-address' ? 'none' : undefined}
        testID={testID}
        accessibilityLabel={label || placeholder}
        style={[
          s.input,
          multiline && { minHeight, textAlignVertical: 'top', paddingTop: 10 },
          !editable && { backgroundColor: HD.sunken, color: HD.muted },
          error && { borderColor: HD.danger },
        ]}
      />
      {error ? <Text style={s.fieldError}>{error}</Text> : hint ? <Text style={s.fieldHint}>{hint}</Text> : null}
      {maxLength && multiline && value?.length > maxLength * 0.8 ? (
        <Text style={s.fieldHint}>{value.length}/{maxLength}</Text>
      ) : null}
    </View>
  );
}

export function Chip({ label, active, onPress, icon, testID }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      testID={testID}
      style={[s.chip, active && s.chipOn]}
    >
      {icon ? <Ionicons name={icon} size={15} color={active ? '#fff' : HD.brand} /> : null}
      <Text style={[s.chipTxt, active && { color: '#fff' }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Empty({ icon = 'file-tray-outline', title, text, children }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={34} color={HD.muted} />
      {title ? <Text style={s.emptyTitle}>{title}</Text> : null}
      {text ? <Text style={s.emptyTxt}>{text}</Text> : null}
      {children}
    </View>
  );
}

export function Notice({ tone = 'info', icon = 'information-circle', children, testID }) {
  const [fg, bg] = TONES[tone] || TONES.info;
  return (
    <View style={[s.notice, { backgroundColor: bg }]} testID={testID}>
      <Ionicons name={icon} size={18} color={fg} />
      <Text style={[s.noticeTxt, { color: fg }]}>{children}</Text>
    </View>
  );
}

/** Velg, lim inn eller dra inn bilder. Viser miniatyrer med fjern-knapp. */
export function AttachmentPicker({ value = [], onChange, max = 4, compact = false, testID = 'attach' }) {
  const zoneRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const room = max - value.length;

  const add = async (getter) => {
    setError('');
    setBusy(true);
    try {
      const more = await getter();
      if (more?.length) onChange([...value, ...more].slice(0, max));
    } catch (e) {
      setError(e?.message || 'Bildet kunne ikke legges ved.');
    } finally {
      setBusy(false);
    }
  };

  // Web: lim inn skjermbilde (Ctrl+V) hvor som helst på siden, og dra-og-slipp på feltet.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onPaste = (event) => {
      const dt = event.clipboardData;
      if (!dt || !Array.from(dt.items || []).some((it) => it.kind === 'file' && /^image\//.test(it.type))) return;
      event.preventDefault();
      add(() => attachmentsFromDataTransfer(dt, max - value.length));
    };
    window.addEventListener('paste', onPaste);
    const el = zoneRef.current;
    const node = el && (el instanceof window.HTMLElement ? el : null);
    const over = (e) => { e.preventDefault(); setDrag(true); };
    const leave = () => setDrag(false);
    const drop = (e) => { e.preventDefault(); setDrag(false); add(() => attachmentsFromDataTransfer(e.dataTransfer, max - value.length)); };
    if (node) {
      node.addEventListener('dragover', over);
      node.addEventListener('dragleave', leave);
      node.addEventListener('drop', drop);
    }
    return () => {
      window.removeEventListener('paste', onPaste);
      if (node) {
        node.removeEventListener('dragover', over);
        node.removeEventListener('dragleave', leave);
        node.removeEventListener('drop', drop);
      }
    };
  });

  return (
    <View ref={zoneRef} style={[s.attachZone, drag && s.attachZoneDrag, compact && s.attachZoneCompact]} testID={testID}>
      <View style={s.thumbRow}>
        {value.map((a, i) => (
          <View key={`${a.name}-${i}`} style={s.thumbWrap}>
            <Image source={{ uri: a.preview }} style={s.thumb} accessibilityLabel={a.name} />
            <TouchableOpacity
              style={s.thumbX}
              onPress={() => onChange(value.filter((_, j) => j !== i))}
              accessibilityRole="button"
              accessibilityLabel={`Fjern ${a.name}`}
            >
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
        {room > 0 ? (
          <TouchableOpacity
            style={[s.addThumb, compact && s.addThumbCompact]}
            onPress={() => add(() => pickAttachments({ room }))}
            accessibilityRole="button"
            accessibilityLabel="Legg ved bilde"
            testID={`${testID}-add`}
          >
            {busy ? <ActivityIndicator color={HD.brand} /> : <Ionicons name="image-outline" size={22} color={HD.brand} />}
            {!compact ? <Text style={s.addThumbTxt}>Legg ved bilde</Text> : null}
          </TouchableOpacity>
        ) : null}
      </View>
      {!compact ? (
        <Text style={s.fieldHint}>
          {Platform.OS === 'web'
            ? `Tips: Ta skjermbilde (Windows + Shift + S eller Cmd + Shift + 4) og lim det inn her med Ctrl + V. Du kan også dra bilder hit. Maks ${max}.`
            : `Legg ved skjermbilder eller bilder. Maks ${max}.`}
        </Text>
      ) : null}
      {error ? <Text style={s.fieldError}>{error}</Text> : null}
    </View>
  );
}

/** Viser et vedlegg fra serveren (lastes ved behov) og åpner det stort ved trykk. */
export function RemoteImage({ attachment, size = 84 }) {
  const [src, setSrc] = useState(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    helpdeskCall('attachment', { attachmentId: attachment.id })
      .then((res) => { if (live && res?.data) setSrc(`data:${res.type};base64,${res.data}`); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [attachment.id]);
  return (
    <>
      <TouchableOpacity
        onPress={() => src && setOpen(true)}
        style={[s.remoteThumb, { width: size, height: size }]}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Åpne ${attachment.name}`}
      >
        {src ? <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: 8 }} />
          : failed ? <Ionicons name="image-outline" size={22} color={HD.muted} />
            : <ActivityIndicator color={HD.brand} />}
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.lightbox} onPress={() => setOpen(false)} accessibilityLabel="Lukk bildet">
          {src ? <Image source={{ uri: src }} style={s.lightboxImg} resizeMode="contain" /> : null}
          <Text style={s.lightboxTxt}>{attachment.name} · trykk for å lukke</Text>
        </Pressable>
      </Modal>
    </>
  );
}

/** Forhåndsvisning av teknisk info før den sendes (brukeren ser hva som deles). */
export function DiagnosticsPreview({ diagnostics, enabled, onToggle }) {
  const [open, setOpen] = useState(false);
  const sum = diagnosticsSummary(diagnostics);
  const env = diagnostics?.env || {};
  return (
    <View style={s.diagBox} testID="diagnostics-preview">
      <TouchableOpacity
        style={s.diagHead}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!enabled }}
        testID="diagnostics-toggle"
      >
        <Ionicons name={enabled ? 'checkbox' : 'square-outline'} size={22} color={HD.brand} />
        <View style={{ flex: 1 }}>
          <Text style={s.diagTitle}>Send med teknisk info (anbefalt)</Text>
          <Text style={s.fieldHint}>
            Hjelper oss å finne feilen uten at du må forklare det tekniske. Ingen passord eller innhold fra dokumentene dine.
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setOpen((v) => !v)} accessibilityRole="button" style={s.diagMore}>
        <Text style={s.link}>{open ? 'Skjul hva som sendes' : 'Se hva som sendes'}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={HD.brand} />
      </TouchableOpacity>
      {open ? (
        <View style={s.diagList}>
          <DiagRow k="Side" v={diagnostics?.page?.path || '–'} />
          <DiagRow k="Nettleser / enhet" v={[env.browser, env.os, env.platform].filter(Boolean).join(' · ') || '–'} />
          <DiagRow k="Skjerm" v={[env.viewport, env.screen].filter(Boolean).join(' / ')} />
          <DiagRow k="ProTop-versjon" v={`${env.appVersion || '?'} (${String(env.buildId || '').slice(0, 12)})`} />
          <DiagRow k="Feilmeldinger" v={`${sum.errors} feil, ${sum.warnings} advarsler`} />
          <DiagRow k="Feilede kall" v={String(sum.failedRequests)} />
          <DiagRow k="Siste steg" v={(diagnostics?.breadcrumbs || []).slice(-4).map((b) => b.label).join(' → ') || '–'} />
        </View>
      ) : null}
    </View>
  );
}

function DiagRow({ k, v }) {
  return (
    <View style={s.diagRow}>
      <Text style={s.diagK}>{k}</Text>
      <Text style={s.diagV} numberOfLines={3}>{v}</Text>
    </View>
  );
}

export function Avatar({ name = '?', size = 32, color = HD.brand }) {
  const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}22`, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

export function Scroll({ children, contentStyle, testID }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[{ paddingBottom: 48 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}

export { pickText };

export const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  pillSmall: { paddingHorizontal: 7, paddingVertical: 2 },
  pillTxt: { fontSize: 12, fontWeight: '600' },
  pillTxtSmall: { fontSize: 11 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1 },
  btnSmall: { minHeight: 34, paddingHorizontal: 12, borderRadius: 8 },
  btnTxt: { fontSize: 15, fontWeight: '600' },
  btnTxtSmall: { fontSize: 13 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: HD.ink, marginBottom: 6 },
  fieldHint: { fontSize: 12.5, color: HD.muted, marginTop: 5, lineHeight: 17 },
  fieldError: { fontSize: 12.5, color: HD.danger, marginTop: 5 },
  input: { borderWidth: 1, borderColor: HD.line, borderRadius: 10, paddingHorizontal: 12, minHeight: 44, fontSize: 15, color: HD.ink, backgroundColor: HD.card },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 38, borderRadius: 999, borderWidth: 1, borderColor: HD.line, backgroundColor: HD.card },
  chipOn: { backgroundColor: HD.brand, borderColor: HD.brand },
  chipTxt: { fontSize: 13.5, color: HD.ink, fontWeight: '500' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: HD.ink },
  empty: { alignItems: 'center', padding: 28, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: HD.ink, textAlign: 'center' },
  emptyTxt: { fontSize: 14, color: HD.muted, textAlign: 'center', maxWidth: 420, lineHeight: 20 },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 10, alignItems: 'flex-start', marginVertical: 8 },
  noticeTxt: { flex: 1, fontSize: 14, lineHeight: 20 },
  attachZone: { borderWidth: 1, borderStyle: 'dashed', borderColor: HD.line, borderRadius: 12, padding: 12, backgroundColor: HD.card },
  attachZoneCompact: { borderWidth: 0, padding: 0, backgroundColor: 'transparent' },
  attachZoneDrag: { borderColor: HD.brand, backgroundColor: HD.brandSoft },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { width: 84, height: 84 },
  thumb: { width: 84, height: 84, borderRadius: 8, backgroundColor: HD.sunken },
  thumbX: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  addThumb: { width: 140, height: 84, borderRadius: 8, borderWidth: 1, borderColor: HD.line, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: HD.brandSoft },
  addThumbCompact: { width: 44, height: 44 },
  addThumbTxt: { fontSize: 13, color: HD.brand, fontWeight: '600' },
  remoteThumb: { borderRadius: 8, backgroundColor: HD.sunken, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: HD.line },
  lightbox: { flex: 1, backgroundColor: 'rgba(15,23,42,0.88)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  lightboxImg: { width: '100%', height: '85%' },
  lightboxTxt: { color: '#fff', marginTop: 10 },
  diagBox: { borderWidth: 1, borderColor: HD.line, borderRadius: 12, padding: 12, backgroundColor: HD.card },
  diagHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  diagTitle: { fontSize: 14.5, fontWeight: '600', color: HD.ink },
  diagMore: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, marginLeft: 32 },
  diagList: { marginTop: 8, marginLeft: 32, gap: 4 },
  diagRow: { flexDirection: 'row', gap: 10 },
  diagK: { width: 130, fontSize: 12.5, color: HD.muted },
  diagV: { flex: 1, fontSize: 12.5, color: HD.ink },
  link: { color: HD.brand, fontSize: 13.5, fontWeight: '600' },
});
