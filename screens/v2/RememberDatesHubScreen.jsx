/**
 * Husk dato — bursdager i familien + egne nedtellinger (jul, ferie, merkedager).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Modal,
  ActivityIndicator, ScrollView, Switch, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Mute } from '../../components/ui';
import { ModulePageFrame, ModuleBgSpacer, ModuleHubIntro } from '../../components/ModulePageBg';
import CompactBackLink from '../../components/CompactBackLink';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import BirthdayPicker from '../../components/BirthdayPicker';
import { AvatarBubble } from '../../components/AvatarPicker';
import ChildArt from '../../components/ChildArt';
import { DeskBtn } from '../../components/DeskBtn';
import ShellAddButton from '../../components/ShellAddButton';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useModuleAsideSlot } from '../../src/hooks/useModuleAsideSlot';
import { useApp } from '../../src/context/AppContext';
import { useThemeMeta } from '../../src/context/ThemeContext';
import { colors, useLayout } from '../../src/theme';
import { toIsoDate } from '../../src/utils/age';
import {
  listenRememberDates,
  createRememberDate,
  updateRememberDate,
  deleteRememberDate,
  addHolidayPreset,
  emptyRememberForm,
  buildUpcomingList,
  availableHolidayPresets,
  formatCountdown,
  formatRememberSubtitle,
  EMOJI_CHOICES,
  REMEMBER_KINDS,
} from '../../src/utils/rememberDates';


const FILTERS = [
  { id: 'all', label: 'Alle' },
  { id: 'birthday', label: 'Bursdager' },
  { id: 'holiday', label: 'Merkedager' },
  { id: 'custom', label: 'Egne' },
];

function CountdownBadge({ days, simpleUi }) {
  const today = days === 0;
  const soon = days != null && days >= 0 && days <= 14;
  return (
    <View style={[
      styles.badge,
      today && styles.badgeToday,
      soon && !today && styles.badgeSoon,
      simpleUi && styles.badgeSimple,
    ]}
    >
      <Text style={[
        styles.badgeTxt,
        today && styles.badgeTxtToday,
        simpleUi && styles.badgeTxtSimple,
      ]}
      >
        {formatCountdown(days)}
      </Text>
    </View>
  );
}

function HolidayPresetBox({ presets, saving, onAdd, compact = false }) {
  if (!presets?.length) return null;
  return (
    <View style={[styles.presetBox, compact && styles.presetBoxAside]}>
      <Text style={[styles.section, compact && styles.sectionAside]}>Legg til merkedag</Text>
      <Text style={styles.presetLead}>Forslag du kan legge inn med ett trykk.</Text>
      <View style={styles.presetGrid}>
        {presets.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.presetChip, compact && styles.presetChipAside]}
            onPress={() => onAdd(p)}
            disabled={saving}
          >
            <Text style={styles.presetEmoji}>{p.emoji}</Text>
            <Text style={styles.presetTxt} numberOfLines={1}>{p.title}</Text>
            <Ionicons name="add-circle" size={18} color={colors.brand} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function DateRow({
  item, onPress, onDelete, simpleUi,
}) {
  const editable = item.source !== 'member' && !item.readOnly;
  return (
    <TouchableOpacity
      style={[styles.row, simpleUi && styles.rowSimple]}
      onPress={editable ? onPress : undefined}
      activeOpacity={editable ? 0.75 : 1}
      accessibilityRole={editable ? 'button' : 'text'}
      accessibilityLabel={`${item.title}, ${formatCountdown(item.daysUntil)}`}
    >
      <View style={[styles.emojiWrap, simpleUi && styles.emojiWrapSimple]}>
        {item.source === 'member' ? (
          <AvatarBubble
            photoURL={item.photoURL}
            avatarId={item.avatarId}
            name={item.memberName || item.title}
            size={simpleUi ? 44 : 36}
            color={item.color}
          />
        ) : (
          <Text style={[styles.emoji, simpleUi && styles.emojiSimple]}>{item.emoji || '🎉'}</Text>
        )}
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, simpleUi && styles.rowTitleSimple]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.rowSub, simpleUi && styles.rowSubSimple]} numberOfLines={2}>
          {item.subtitle || formatRememberSubtitle(item)}
        </Text>
      </View>
      <CountdownBadge days={item.daysUntil} simpleUi={simpleUi} />
      {editable ? (
        <TouchableOpacity
          style={styles.rowMore}
          onPress={onDelete}
          hitSlop={10}
          accessibilityLabel="Slett"
        >
          <Ionicons name="trash-outline" size={18} color={colors.muted} />
        </TouchableOpacity>
      ) : (
        <View style={styles.rowMore} />
      )}
    </TouchableOpacity>
  );
}

export default function RememberDatesHubScreen({
  compactHeader = false, inShell = false, onBack,
}) {
  const { isDesktop } = useLayout();
  const { highChildFriendliness } = useThemeMeta();
  const simpleUi = highChildFriendliness;
  const {
    familyId, uid, members, requestShellTab, shellIntent, clearShellIntent,
  } = useApp();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyRememberForm());
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState({ visible: false, title: '', message: '' });
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    if (!familyId) {
      setEvents([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return listenRememberDates(familyId, (rows) => {
      setEvents(rows);
      setLoading(false);
    });
  }, [familyId]);

  const upcoming = useMemo(
    () => buildUpcomingList({ members, events, filter }),
    [members, events, filter],
  );

  const presets = useMemo(() => availableHolidayPresets(events), [events]);

  const nextUp = upcoming.find((r) => r.daysUntil != null && r.daysUntil >= 0) || null;

  const goBack = useCallback(() => {
    if (onBack) onBack();
    else requestShellTab?.('more', null);
  }, [onBack, requestShellTab]);

  const showInfo = useCallback((title, message) => {
    setInfo({ visible: true, title, message: String(message || '') });
  }, []);

  const openCreate = useCallback((preset = null) => {
    if (preset) {
      const year = new Date().getFullYear();
      const dateKey = `${year}-${String(preset.month).padStart(2, '0')}-${String(preset.day).padStart(2, '0')}`;
      setForm(emptyRememberForm({
        title: preset.title,
        emoji: preset.emoji,
        dateKey,
        yearly: true,
        kind: REMEMBER_KINDS.holiday,
        presetKey: preset.key,
        note: preset.note || '',
      }));
    } else {
      setForm(emptyRememberForm());
    }
    setEditingId(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((item) => {
    if (!item || item.readOnly || item.source === 'member') return;
    setForm(emptyRememberForm({
      title: item.title || '',
      emoji: item.emoji || '🎉',
      dateKey: item.dateKey || toIsoDate(item.nextDate),
      yearly: item.yearly !== false,
      kind: item.kind || REMEMBER_KINDS.custom,
      presetKey: item.presetKey || null,
      note: item.note || '',
    }));
    setEditingId(item.id);
    setFormOpen(true);
  }, []);

  useEffect(() => {
    if (shellIntent !== 'create') return;
    clearShellIntent?.();
    openCreate();
  }, [shellIntent, clearShellIntent, openCreate]);

  const shellAddBtn = useMemo(
    () => <ShellAddButton label="Ny dato" onPress={() => openCreate()} />,
    [openCreate],
  );
  useShellTitleRight(shellAddBtn, { active: inShell || compactHeader });

  const saveForm = useCallback(async () => {
    if (!familyId || !uid) return;
    try {
      setSaving(true);
      if (editingId) {
        await updateRememberDate(familyId, editingId, form);
      } else {
        await createRememberDate(familyId, uid, form);
      }
      setFormOpen(false);
      setEditingId(null);
    } catch (e) {
      showInfo('Husk dato', e?.message || 'Kunne ikke lagre.');
    } finally {
      setSaving(false);
    }
  }, [familyId, uid, editingId, form, showInfo]);

  const quickAddPreset = useCallback(async (preset) => {
    if (!familyId || !uid) return;
    try {
      setSaving(true);
      await addHolidayPreset(familyId, uid, preset.key);
    } catch (e) {
      showInfo('Merkedag', e?.message || 'Kunne ikke legge til.');
    } finally {
      setSaving(false);
    }
  }, [familyId, uid, showInfo]);

  const asidePresets = useMemo(
    () => (
      <HolidayPresetBox
        presets={presets}
        saving={saving}
        onAdd={quickAddPreset}
        compact
      />
    ),
    [presets, saving, quickAddPreset],
  );
  useModuleAsideSlot(asidePresets, {
    active: isDesktop && (inShell || compactHeader) && presets.length > 0,
  });

  const doDelete = useCallback(async () => {
    if (!familyId || !confirmDelete?.id) return;
    try {
      setSaving(true);
      await deleteRememberDate(familyId, confirmDelete.id);
      setConfirmDelete(null);
    } catch (e) {
      showInfo('Slett', e?.message || 'Kunne ikke slette.');
    } finally {
      setSaving(false);
    }
  }, [familyId, confirmDelete, showInfo]);

  const futureMax = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 12);
    return toIsoDate(d);
  }, []);

  const pastMin = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return toIsoDate(d);
  }, []);

  const showHubChrome = !inShell && !compactHeader;

  return (
    <Screen>
      <ModulePageFrame name="remember-dates">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {showHubChrome ? (
          <>
            <CompactBackLink onPress={goBack} label="Mer" />
            <View style={styles.titleRow}>
              <ModuleHubIntro>
              <Text style={[styles.title, simpleUi && styles.titleSimple]}>Husk dato</Text>
              </ModuleHubIntro>
              {isDesktop ? <DeskBtn label="Ny dato" onPress={() => openCreate()} /> : null}
            </View>
            <ModuleHubIntro>
            <Mute style={simpleUi ? styles.leadSimple : null}>
              Bursdager i familien og nedtelling til jul, ferie og andre merkedager.
            </Mute>
            </ModuleHubIntro>
          </>
        ) : (
          <ModuleHubIntro>
          <Mute style={simpleUi ? styles.leadSimple : null}>
            Bursdager og nedtelling til det som nærmer seg.
          </Mute>
          </ModuleHubIntro>
        )}

        {nextUp ? (
          <View style={[styles.hero, simpleUi && styles.heroSimple]}>
            <Text style={styles.heroEmoji}>{nextUp.emoji || '🎂'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroLabel, simpleUi && styles.heroLabelSimple]}>Neste</Text>
              <Text style={[styles.heroTitle, simpleUi && styles.heroTitleSimple]} numberOfLines={1}>
                {nextUp.title}
              </Text>
              <Text style={styles.heroSub}>{nextUp.subtitle}</Text>
            </View>
            <CountdownBadge days={nextUp.daysUntil} simpleUi={simpleUi} />
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterChip, filter === f.id && styles.filterChipOn]}
              onPress={() => setFilter(f.id)}
            >
              <Text style={[styles.filterTxt, filter === f.id && styles.filterTxtOn]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
        ) : upcoming.length === 0 ? (
          <View style={styles.empty}>
            <ChildArt name="appRememberDates" style={styles.emptyArt} />
            <Text style={styles.emptyTitle}>Ingen datoer her ennå</Text>
            <Text style={styles.emptySub}>
              Legg til bursdag på profilen, eller lag en egen nedtelling.
            </Text>
            <TouchableOpacity style={styles.primary} onPress={() => openCreate()}>
              <Text style={styles.primaryTxt}>Legg til dato</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {upcoming.map((item) => (
              <DateRow
                key={item.id}
                item={item}
                simpleUi={simpleUi}
                onPress={() => openEdit(item)}
                onDelete={() => setConfirmDelete(item)}
              />
            ))}
          </View>
        )}

        {!(isDesktop && (inShell || compactHeader)) ? (
          <HolidayPresetBox presets={presets} saving={saving} onAdd={quickAddPreset} />
        ) : null}

        {!isDesktop && !inShell ? (
          <TouchableOpacity style={styles.fabLike} onPress={() => openCreate()}>
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={styles.fabTxt}>Ny nedtelling</Text>
          </TouchableOpacity>
        ) : null}
      <ModuleBgSpacer />
      </ScrollView>
      </ModulePageFrame>
      <Modal visible={formOpen} animationType="slide" transparent onRequestClose={() => setFormOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFormOpen(false)}>
          <Pressable style={[styles.modalCard, isDesktop && styles.modalCardDesk]} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{editingId ? 'Rediger dato' : 'Ny nedtelling'}</Text>
              <TouchableOpacity onPress={() => setFormOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Tittel</Text>
              <TextInput
                style={[styles.input, simpleUi && styles.inputSimple]}
                value={form.title}
                onChangeText={(title) => setForm((s) => ({ ...s, title }))}
                placeholder="F.eks. Sommerferie"
                placeholderTextColor={colors.placeholder}
                maxLength={60}
              />

              <Text style={styles.fieldLabel}>Emoji</Text>
              <View style={styles.emojiRow}>
                {EMOJI_CHOICES.map((em) => (
                  <TouchableOpacity
                    key={em}
                    style={[styles.emojiPick, form.emoji === em && styles.emojiPickOn]}
                    onPress={() => setForm((s) => ({ ...s, emoji: em }))}
                  >
                    <Text style={{ fontSize: 22 }}>{em}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Dato</Text>
              <BirthdayPicker
                value={form.dateKey}
                onChange={(dateKey) => setForm((s) => ({ ...s, dateKey }))}
                showAge={false}
                allowClear={false}
                minValue={pastMin}
                maxValue={futureMax}
                emptyLabel="Velg dato"
              />

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Gjentas hvert år</Text>
                  <Text style={styles.switchSub}>Perfekt for bursdag, jul og merkedager</Text>
                </View>
                <Switch
                  value={form.yearly !== false}
                  onValueChange={(yearly) => setForm((s) => ({ ...s, yearly }))}
                  trackColor={{ true: colors.brand }}
                />
              </View>

              <Text style={styles.fieldLabel}>Notat (valgfritt)</Text>
              <TextInput
                style={[styles.input, simpleUi && styles.inputSimple]}
                value={form.note}
                onChangeText={(note) => setForm((s) => ({ ...s, note }))}
                placeholder="F.eks. kjøp gave"
                placeholderTextColor={colors.placeholder}
                maxLength={120}
              />

              <TouchableOpacity
                style={[styles.primary, saving && { opacity: 0.6 }]}
                onPress={saveForm}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.primaryTxt}>{editingId ? 'Lagre' : 'Legg til'}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmActionModal
        visible={!!confirmDelete}
        title="Slett dato?"
        body={confirmDelete ? `Vil du slette «${confirmDelete.title}»?` : ''}
        confirmLabel="Slett"
        cancelLabel="Avbryt"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
      <ConfirmActionModal
        visible={info.visible}
        title={info.title}
        body={info.message}
        confirmLabel="OK"
        cancelLabel="Lukk"
        onConfirm={() => setInfo((s) => ({ ...s, visible: false }))}
        onCancel={() => setInfo((s) => ({ ...s, visible: false }))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, zIndex: 1, backgroundColor: 'transparent' },
  body: { padding: 16, paddingBottom: 48 },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6,
  },
  title: { fontSize: 20, fontWeight: '500', color: colors.ink },
  titleSimple: { fontSize: 22 },
  leadSimple: { fontSize: 16, lineHeight: 22 },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.brandSoft, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: colors.brand, marginTop: 14,
  },
  heroSimple: { borderRadius: 20, paddingVertical: 18 },
  heroEmoji: { fontSize: 36 },
  heroLabel: {
    color: colors.muted, fontWeight: '500', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  heroLabelSimple: { fontSize: 12 },
  heroTitle: { color: colors.ink, fontWeight: '500', fontSize: 18 },
  heroTitleSimple: { fontSize: 22 },
  heroSub: { color: colors.muted, fontWeight: '400', marginTop: 2 },
  filterScroll: { marginTop: 14, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, marginRight: 8,
  },
  filterChipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  filterTxt: { fontWeight: '400', color: colors.muted, fontSize: 13 },
  filterTxtOn: { color: colors.brand, fontWeight: '500' },
  list: { gap: 8, marginTop: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: colors.line,
  },
  rowSimple: { borderRadius: 18, borderWidth: 2, paddingVertical: 14 },
  emojiWrap: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiWrapSimple: { width: 48, height: 48, borderRadius: 16 },
  emoji: { fontSize: 22 },
  emojiSimple: { fontSize: 26 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontWeight: '500', color: colors.ink, fontSize: 15 },
  rowTitleSimple: { fontSize: 18, fontWeight: '500' },
  rowSub: { color: colors.muted, fontWeight: '400', fontSize: 12, marginTop: 2 },
  rowSubSimple: { fontSize: 14 },
  rowMore: { width: 28, alignItems: 'center' },
  badge: {
    backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    minWidth: 72, alignItems: 'center',
  },
  badgeSimple: { borderRadius: 12, paddingVertical: 8 },
  badgeToday: { backgroundColor: '#dcfce7' },
  badgeSoon: { backgroundColor: '#fef3c7' },
  badgeTxt: { fontWeight: '500', color: colors.ink, fontSize: 12 },
  badgeTxtToday: { color: '#15803d' },
  badgeTxtSimple: { fontSize: 14 },
  empty: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  emptyArt: { width: 96, height: 96, marginBottom: 4 },
  emptyTitle: { fontWeight: '500', fontSize: 17, color: colors.ink },
  emptySub: { color: colors.muted, textAlign: 'center', paddingHorizontal: 20, marginBottom: 8 },
  section: {
    marginTop: 8, marginBottom: 4, color: colors.muted, fontWeight: '500',
    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  sectionAside: { marginTop: 0 },
  presetLead: {
    color: colors.muted, fontWeight: '400', fontSize: 12, lineHeight: 17, marginBottom: 8,
  },
  presetBox: { marginTop: 18 },
  presetBoxAside: {
    marginTop: 0,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
  },
  presetGrid: { gap: 8 },
  presetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.line,
  },
  presetChipAside: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  presetChipSimple: { borderRadius: 16, borderWidth: 2, paddingVertical: 14 },
  presetEmoji: { fontSize: 20 },
  presetTxt: { flex: 1, fontWeight: '400', color: colors.ink },
  presetTxtSimple: { fontSize: 17, fontWeight: '400' },
  fabLike: {
    marginTop: 20, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.brand, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 12,
  },
  fabTxt: { color: '#fff', fontWeight: '500' },
  primary: {
    backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 16,
  },
  primaryTxt: { color: '#fff', fontWeight: '500', fontSize: 16 },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, maxHeight: '92%',
  },
  modalCardDesk: {
    alignSelf: 'center', width: '100%', maxWidth: 480, borderRadius: 20,
    marginBottom: 40, maxHeight: '85%',
  },
  modalHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '500', color: colors.ink },
  fieldLabel: {
    marginTop: 12, marginBottom: 6, color: colors.muted, fontWeight: '500',
    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  input: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: colors.ink, fontWeight: '400',
  },
  inputSimple: { borderRadius: 16, borderWidth: 2, paddingVertical: 14, fontSize: 18 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiPick: {
    width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  emojiPickOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: 12, padding: 12, marginTop: 14,
    borderWidth: 1, borderColor: colors.line,
  },
  switchTitle: { fontWeight: '500', color: colors.ink },
  switchSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
