/**
 * Møtemaler: bedriftens egne og ProTops ferdige maler. En egen mal kan lages
 * blank, fra et skjema i Skjemabygger, med AI eller som kopi av en ProTop-mal.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import DialogShell from '../economy/invoice/DialogShell';
import OptionPicker from '../../components/OptionPicker';
import ConfirmDialog from '../../components/ConfirmDialog';
import { showSaveToast } from '../../src/ui/saveToast';
import { RECURRENCE, VISIBILITY, createMeetingId, durationLabel, normalizeChapter, text } from '../../src/meetings/model';
import {
  MEETING_TYPES, agendaFromForm, builtinTemplates, meetingType, normalizeTemplate, templateStats,
} from '../../src/meetings/templates';
import { suggestAgenda } from '../../src/meetings/ai';
import AgendaPreview from './AgendaPreview';
import {
  Banner, Btn, Card, Choice, Empty, Field, IconBtn, Label, Pill, SearchBox, SectionHead, TypeIcon,
} from './meetingUi';

function TemplateTile({ template, onUse, onEdit, onCopy, onDelete, canEdit }) {
  const colors = useColors();
  const stats = templateStats(template);
  const type = meetingType(template.typeId);
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={[styles.tileBar, { backgroundColor: type.color }]} />
      <View style={styles.rowWrap}>
        <TypeIcon typeId={template.typeId} size={38} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }} numberOfLines={1}>{template.name}</Text>
          <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
            {stats.items} punkter · {durationLabel(template.durationMin || stats.minutes)}
            {template.recurrence !== 'none' ? ` · ${RECURRENCE.find((r) => r.id === template.recurrence)?.short}` : ''}
          </Text>
        </View>
        {template.visibility === 'deltakere' ? <Pill label="Lukket" icon="lock-closed" small /> : null}
      </View>
      {template.summary ? <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }} numberOfLines={3}>{template.summary}</Text> : null}
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.rowWrap} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.brand} />
        <Text style={{ fontSize: 12.5, color: colors.brand, fontWeight: '600' }}>{open ? 'Skjul dagsorden' : 'Vis dagsorden'}</Text>
      </Pressable>
      {open ? <AgendaPreview chapters={template.chapters} /> : null}
      <View style={[styles.rowWrap, { marginTop: 'auto', paddingTop: 4 }]}>
        <Btn small label="Bruk" icon="add" tone="primary" onPress={() => onUse(template.id)} nativeID={`tpl-use-${template.id}`} />
        {canEdit && !template.builtin ? <Btn small label="Rediger" icon="create-outline" tone="ghost" onPress={() => onEdit(template)} /> : null}
        {canEdit && template.builtin ? <Btn small label="Kopier og tilpass" icon="copy-outline" tone="ghost" onPress={() => onCopy(template)} /> : null}
        {canEdit && !template.builtin ? <IconBtn icon="trash-outline" label={`Slett ${template.name}`} onPress={() => onDelete(template)} /> : null}
      </View>
    </View>
  );
}

function ChapterEditor({ chapters, onChange }) {
  const colors = useColors();
  const set = (ci, patch) => onChange(chapters.map((c, i) => (i === ci ? { ...c, ...patch } : c)));
  const setItem = (ci, ii, patch) => set(ci, { items: chapters[ci].items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) });
  return (
    <View style={{ gap: 12 }}>
      {chapters.map((chapter, ci) => (
        <View key={chapter.id} style={[styles.chBox, { borderColor: colors.line }]}>
          <View style={styles.rowWrap}>
            <Text style={{ width: 20, fontWeight: '800', color: colors.brand }}>{ci + 1}</Text>
            <TextInput
              value={chapter.title}
              onChangeText={(v) => set(ci, { title: v })}
              placeholder="Kapittel"
              placeholderTextColor={colors.placeholder}
              accessibilityLabel={`Kapittel ${ci + 1}`}
              style={[styles.inline, { color: colors.ink, fontWeight: '700', flex: 1 }]}
            />
            <IconBtn icon="trash-outline" label="Fjern kapittel" onPress={() => onChange(chapters.filter((_, i) => i !== ci))} />
          </View>
          {chapter.items.map((item, ii) => (
            <View key={item.id} style={[styles.itemRow, { borderLeftColor: colors.line }]}>
              <Text style={{ width: 30, fontSize: 12, color: colors.muted }}>{ci + 1}.{ii + 1}</Text>
              <TextInput
                value={item.title}
                onChangeText={(v) => setItem(ci, ii, { title: v })}
                placeholder="Punkt"
                placeholderTextColor={colors.placeholder}
                accessibilityLabel={`Punkt ${ci + 1}.${ii + 1}`}
                style={[styles.inline, { color: colors.ink, flex: 1 }]}
              />
              <TextInput
                value={String(item.minutes || '')}
                onChangeText={(v) => setItem(ci, ii, { minutes: Math.max(0, Math.min(600, Number(v.replace(/\D/g, '')) || 0)) })}
                keyboardType="number-pad"
                accessibilityLabel="Minutter"
                style={[styles.inline, styles.min, { color: colors.ink, borderColor: colors.line }]}
              />
              <Text style={{ fontSize: 12, color: colors.muted }}>min</Text>
              <IconBtn icon="close" size={15} label="Fjern punkt" onPress={() => set(ci, { items: chapter.items.filter((_, j) => j !== ii) })} />
            </View>
          ))}
          <Btn small label="Punkt" icon="add" tone="plain" onPress={() => set(ci, { items: [...chapter.items, { id: createMeetingId('pkt'), title: '', minutes: 5, description: '' }] })} style={{ alignSelf: 'flex-start' }} />
        </View>
      ))}
      <Btn small label="Kapittel" icon="add" tone="soft" onPress={() => onChange([...chapters, normalizeChapter({ title: '', items: [{ title: '', minutes: 5 }] })])} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

function TemplateEditor({ visible, template, onClose, onSave, store, companyId, width }) {
  const colors = useColors();
  const [draft, setDraft] = useState(template);
  const [forms, setForms] = useState(null);
  const [mode, setMode] = useState('');
  const [aiText, setAiText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const phone = width < 700;

  useEffect(() => { if (visible) { setDraft(template); setMode(''); setError(''); setAiText(''); } }, [visible, template]);
  useEffect(() => {
    if (mode !== 'skjema' || forms) return;
    store?.loadForms?.().then((rows) => setForms(rows || [])).catch(() => setForms([]));
  }, [mode, forms, store]);

  if (!draft) return null;
  const patch = (p) => setDraft((d) => ({ ...d, ...p }));

  async function fromAi() {
    setBusy(true);
    const result = await suggestAgenda({ description: aiText || draft.summary || draft.name, typeId: draft.typeId, minutes: draft.durationMin, title: draft.name, companyId }, { remote: !store?.demo });
    patch({ chapters: result.chapters, name: draft.name || result.title, typeId: draft.typeId !== 'annet' ? draft.typeId : (result.typeId || 'annet') });
    setBusy(false);
    setMode('');
  }

  async function save() {
    if (!text(draft.name)) { setError('Gi malen et navn.'); return; }
    const chapters = draft.chapters
      .map((c) => ({ ...c, title: text(c.title), items: c.items.filter((i) => text(i.title)) }))
      .filter((c) => c.title && c.items.length);
    if (!chapters.length) { setError('Malen trenger minst ett kapittel med ett punkt.'); return; }
    setBusy(true);
    try {
      await onSave(normalizeTemplate({ ...draft, chapters, builtin: false, source: draft.source === 'protop' ? 'egen' : draft.source }));
    } catch (cause) {
      setError(String(cause?.message || 'Malen ble ikke lagret.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell
      visible={visible}
      title={template?.createdAt ? 'Rediger møtemal' : 'Ny møtemal'}
      onClose={onClose}
      colors={colors}
      width={880}
      footer={(
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn label="Avbryt" tone="ghost" onPress={onClose} />
          <Btn label="Lagre malen" icon="checkmark" tone="primary" busy={busy} onPress={save} nativeID="template-save" />
        </View>
      )}
    >
      {error ? <Banner tone="danger" icon="alert-circle">{error}</Banner> : null}
      <View style={[styles.split, phone && { flexDirection: 'column' }]}>
        <View style={{ flex: 1, gap: 12, minWidth: 0 }}>
          <Field label="Navn" value={draft.name} onChange={(v) => patch({ name: v })} placeholder="For eksempel Byggemøte (vår mal)" nativeID="template-name" />
          <Field label="Beskrivelse" value={draft.summary} onChange={(v) => patch({ summary: v })} multiline minHeight={60} placeholder="Når brukes malen?" />
          <View style={{ gap: 6 }}>
            <Label>Type</Label>
            <OptionPicker options={MEETING_TYPES.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))} value={draft.typeId} onChange={(id) => patch({ typeId: id || 'annet' })} clearable={false} chipLimit={0} title="Møtetype" />
          </View>
          <Field label="Lengde i minutter" value={String(draft.durationMin || '')} onChange={(v) => patch({ durationMin: Number(v.replace(/\D/g, '')) || 0 })} keyboardType="number-pad" />
          <View style={{ gap: 6 }}>
            <Label>Gjentakelse</Label>
            <Choice small options={RECURRENCE.map((r) => ({ id: r.id, label: r.short }))} value={draft.recurrence} onChange={(v) => patch({ recurrence: v })} />
          </View>
          <View style={{ gap: 6 }}>
            <Label>Hvem ser møtene</Label>
            <Choice small options={VISIBILITY.map((v) => ({ id: v.id, label: v.label }))} value={draft.visibility} onChange={(v) => patch({ visibility: v })} />
          </View>
        </View>
        <View style={{ flex: 1.4, gap: 10, minWidth: 0 }}>
          <View style={styles.rowWrap}>
            <Label style={{ flex: 1 }}>DAGSORDEN</Label>
            <Btn small label="Fra skjema" icon="clipboard-outline" tone={mode === 'skjema' ? 'soft' : 'ghost'} onPress={() => setMode(mode === 'skjema' ? '' : 'skjema')} />
            <Btn small label="Foreslå med AI" icon="sparkles" tone="ai" onPress={() => setMode(mode === 'ai' ? '' : 'ai')} />
          </View>
          {mode === 'skjema' ? (
            <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
              {forms == null ? <ActivityIndicator color={colors.brand} /> : forms.map((f) => (
                <Pressable key={f.id} onPress={() => { patch({ chapters: agendaFromForm(f), name: draft.name || f.title, source: 'skjema' }); setMode(''); }} style={({ hovered }) => [styles.formRow, hovered && { backgroundColor: colors.card }]}>
                  <Ionicons name="clipboard-outline" size={15} color={colors.brand} />
                  <Text style={{ flex: 1, fontSize: 13, color: colors.ink }} numberOfLines={1}>{f.title}</Text>
                  <Text style={{ fontSize: 11.5, color: colors.muted }}>{f.source === 'egen' ? 'Bedriftens' : f.ref}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {mode === 'ai' ? (
            <View style={[styles.panel, { borderColor: '#ddd6fe', backgroundColor: '#faf8ff', gap: 8 }]}>
              <Field value={aiText} onChange={setAiText} multiline minHeight={70} placeholder="Beskriv møtet malen er for" />
              <Btn small label="Lag forslag" icon="sparkles" tone="ai" busy={busy} onPress={fromAi} style={{ alignSelf: 'flex-start' }} />
            </View>
          ) : null}
          <ChapterEditor chapters={draft.chapters} onChange={(chapters) => patch({ chapters })} />
        </View>
      </View>
    </DialogShell>
  );
}

export default function TemplatesView({ templates, store, canEdit, viewer, onUse, width, companyId }) {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const builtin = useMemo(() => builtinTemplates(), []);
  const match = (t) => !query || `${t.name} ${t.summary} ${meetingType(t.typeId).label}`.toLowerCase().includes(query.toLowerCase());
  const own = templates.filter(match);
  const ours = builtin.filter(match);

  function startNew() {
    setEditing(normalizeTemplate({ name: '', typeId: 'annet', durationMin: 60, chapters: [{ title: 'Saker', items: [{ title: '', minutes: 10 }] }], createdBy: viewer?.uid, createdByName: viewer?.name }));
  }

  function copy(template) {
    setEditing(normalizeTemplate({ ...template, id: createMeetingId('mal'), name: `${template.name} (vår mal)`, builtin: false, source: 'egen', createdAt: '', createdBy: viewer?.uid, createdByName: viewer?.name }));
  }

  async function save(template) {
    const saved = await store.saveTemplate({ ...template, createdAt: template.createdAt || new Date().toISOString() });
    setEditing(null);
    showSaveToast(`Malen «${saved.name}» er lagret.`);
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={[styles.toolbar, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <SearchBox value={query} onChange={setQuery} placeholder="Søk i maler" style={{ flex: 1, minWidth: 220 }} />
        {canEdit ? <Btn label="Ny mal" icon="add" tone="primary" onPress={startNew} nativeID="templates-new" /> : null}
      </View>

      <SectionHead title="Bedriftens maler" count={own.length} />
      {own.length ? (
        <View style={styles.grid}>
          {own.map((t) => <TemplateTile key={t.id} template={t} onUse={onUse} onEdit={setEditing} onCopy={copy} onDelete={setDeleting} canEdit={canEdit} />)}
        </View>
      ) : (
        <Card>
          <Empty
            icon="albums-outline"
            title="Ingen egne maler ennå"
            text="Lagre et møte som mal fra menyen i møtet, kopier en ProTop-mal og tilpass den, eller lag en ny fra et skjema eller med AI."
            action={canEdit ? <Btn label="Ny mal" icon="add" tone="soft" onPress={startNew} /> : null}
          />
        </Card>
      )}

      <SectionHead title="ProTop-maler" count={ours.length} />
      <View style={styles.grid}>
        {ours.map((t) => <TemplateTile key={t.id} template={t} onUse={onUse} onEdit={setEditing} onCopy={copy} onDelete={setDeleting} canEdit={canEdit} />)}
      </View>

      <TemplateEditor visible={!!editing} template={editing} onClose={() => setEditing(null)} onSave={save} store={store} companyId={companyId} width={width} />
      <ConfirmDialog
        visible={!!deleting}
        title="Slette malen?"
        message={deleting ? `«${deleting.name}» slettes. Møter som er laget fra malen, beholder dagsordenen sin.` : ''}
        confirmText="Slett"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const row = deleting;
          setDeleting(null);
          await store.deleteTemplate(row.id);
          showSaveToast('Malen er slettet.');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 10, flexWrap: 'wrap' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexGrow: 1, flexBasis: 300, maxWidth: 420, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10, overflow: 'hidden' },
  tileBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  split: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  chBox: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 10, paddingLeft: 10, borderLeftWidth: 2 },
  inline: { fontSize: 14, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 6, outlineStyle: 'none', minWidth: 60 },
  min: { width: 50, minWidth: 50, textAlign: 'right', borderWidth: 1 },
  panel: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 2 },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 8 },
});
