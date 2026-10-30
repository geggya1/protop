import React, { useEffect, useState } from 'react';
import {
  Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { JOB_STATUSES, localIsoDate, normalizeJob } from '../../src/hr/model';
import OptionPicker from '../../components/OptionPicker';
import { HrButton, HrChip, HrField } from './HrShared';
import { radius, type } from '../../src/ui/tokens';

const EMPTY = {
  title: '', department: '', location: '', description: '', requirements: '',
  status: 'open', headcount: '1', closesAt: '', ownerUid: '', ownerName: '',
};

function draftOf(job, actor) {
  if (!job) return { ...EMPTY, ownerUid: actor?.uid || '', ownerName: actor?.uid ? actor?.name || '' : '' };
  return {
    ...EMPTY,
    ...job,
    headcount: String(job.headcount || 1),
  };
}

/** Ny eller endret stillingsannonse. Kravene brukes når AI vurderer søkerne. */
export default function RecruitmentJobForm({
  colors, job, actor, ownerOptions, applicationCount = 0, onSave, onDelete, onClose,
}) {
  const [draft, setDraft] = useState(() => draftOf(job, actor));
  useEffect(() => { setDraft(draftOf(job, actor)); }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (key) => (value) => setDraft((prev) => ({ ...prev, [key]: value }));
  const title = job ? 'Endre stilling' : 'Ny stilling';

  function save() {
    if (!draft.title.trim()) return;
    const publish = draft.status === 'open' && !job?.publishedAt;
    const row = normalizeJob({
      ...(job || {}),
      ...draft,
      headcount: Number(draft.headcount) || 1,
      publishedAt: publish ? localIsoDate() : job?.publishedAt,
      updatedAt: new Date().toISOString(),
    });
    onSave(row);
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk" />
        <View
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}
          accessibilityRole="dialog"
          accessibilityLabel={title}
          nativeID="hr-job-form"
        >
          <View style={[styles.head, { borderBottomColor: colors.line }]}>
            <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Lukk">
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <HrField colors={colors} label="Tittel" value={draft.title} onChangeText={set('title')} autoFocus={!job} placeholder="Prosjektleder bygg" />
            <View style={styles.grid}>
              <View style={styles.cell}><HrField colors={colors} label="Avdeling" value={draft.department} onChangeText={set('department')} /></View>
              <View style={styles.cell}><HrField colors={colors} label="Sted" value={draft.location} onChangeText={set('location')} /></View>
              <View style={styles.cell}><HrField colors={colors} label="Antall stillinger" value={draft.headcount} onChangeText={set('headcount')} keyboardType="numeric" /></View>
              <View style={styles.cell}><HrField colors={colors} label="Søknadsfrist" value={draft.closesAt} onChangeText={set('closesAt')} date="iso" clearable /></View>
            </View>
            <Text style={[styles.label, { color: colors.muted }]}>Ansvarlig for rekrutteringen</Text>
            <OptionPicker
              options={ownerOptions}
              value={draft.ownerUid}
              onChange={(id) => {
                const hit = ownerOptions.find((row) => row.id === id);
                setDraft((prev) => ({ ...prev, ownerUid: id || '', ownerName: id ? (hit?.name || hit?.label || '') : '' }));
              }}
              placeholder="Velg ansvarlig"
              title="Ansvarlig"
            />
            <Text style={[styles.label, { color: colors.muted }]}>Status</Text>
            <View style={styles.chips}>
              {JOB_STATUSES.map((status) => (
                <HrChip key={status.id} colors={colors} label={status.label} active={draft.status === status.id} onPress={() => set('status')(status.id)} />
              ))}
            </View>
            <HrField colors={colors} label="Beskrivelse" value={draft.description} onChangeText={set('description')} multiline />
            <HrField
              colors={colors}
              label="Krav og kvalifikasjoner"
              value={draft.requirements}
              onChangeText={set('requirements')}
              multiline
              placeholder={'Én linje per krav, f.eks.\nIngeniør eller tilsvarende\n5 års erfaring fra byggeprosjekter'}
            />
            <Text style={[styles.hint, { color: colors.muted }]}>
              AI vurderer hver søker mot kravene når CV-en leses. Jo tydeligere krav, desto bedre vurdering.
            </Text>
          </ScrollView>
          <View style={[styles.foot, { borderTopColor: colors.line }]}>
            {job && onDelete ? (
              <HrButton
                colors={colors}
                label={applicationCount ? 'Lukk stillingen' : 'Slett stillingen'}
                icon={applicationCount ? 'lock-closed-outline' : 'trash-outline'}
                onPress={() => onDelete(job)}
              />
            ) : null}
            <View style={{ flex: 1 }} />
            <HrButton colors={colors} label="Avbryt" onPress={onClose} />
            <HrButton
              colors={colors}
              label={job ? 'Lagre' : 'Opprett stilling'}
              primary
              icon="megaphone-outline"
              disabled={!draft.title.trim()}
              onPress={save}
              nativeID="hr-job-save"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '92%',
    borderWidth: 1,
    borderRadius: radius.sheet,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 18px 48px rgba(15, 23, 42, 0.22)' } : { elevation: 8 }),
  },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1,
  },
  title: { fontSize: type.title.fontSize, fontWeight: '700' },
  scroll: { flexGrow: 0 },
  body: { padding: 16, gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { flexGrow: 1, flexBasis: 200, minWidth: 0 },
  label: { fontSize: type.caption.fontSize, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: type.caption.fontSize, lineHeight: 17 },
  foot: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderTopWidth: 1, flexWrap: 'wrap',
  },
});
